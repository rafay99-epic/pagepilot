import { createHash, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { PAGE_ID } from "../shared/api";
import type { Env } from "./env";
import { errorResponse } from "./http";
import type { Json } from "./http";
import { findPage, listPages, publicBase } from "./pages";

const MAX_HTML_BYTES = 900_000;
const MAX_REQUEST_BYTES = 6 * MAX_HTML_BYTES + 16_384;

function text(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

// Constant-time bearer token comparison.
export function isAuthed(request: Request, key: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(key);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

// The MCP endpoint: authenticates, reads a bounded body, then serves one
// stateless JSON-RPC request from a fresh server.
export async function handleMcp(request: Request, env: Env): Promise<Response> {
  if (!env.PAGEPILOT_API_KEY) return errorResponse(503, "API key is not configured");
  if (!isAuthed(request, env.PAGEPILOT_API_KEY)) {
    return errorResponse(401, "Unauthorized: send Authorization: Bearer <key>");
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return errorResponse(403, "Origin not allowed");
  }
  if (request.method !== "POST") {
    return new Response(null, {
      status: 405,
      headers: { allow: "POST", "cache-control": "no-store" },
    });
  }
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
    return errorResponse(415, "Expected application/json");
  }
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    return errorResponse(413, "Request too large");
  }
  const reader = request.body?.getReader();
  if (!reader) return errorResponse(400, "Missing request body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return errorResponse(413, "Request too large");
    }
    chunks.push(value);
  }
  let parsedBody: Json;
  try {
    parsedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return errorResponse(400, "Invalid JSON");
  }

  const base = publicBase(request, env);
  const server = new McpServer({ name: "pagepilot", version: "3.0.0" });
  server.registerTool(
    "deploy_page",
    {
      description:
        "Publish HTML and return a link. Anyone holding the link can read the page. Maximum 900,000 UTF-8 bytes.",
      inputSchema: {
        html: z.string().min(1).max(MAX_HTML_BYTES),
        title: z.string().max(120).optional(),
      },
    },
    async ({ html, title }) => {
      if (Buffer.byteLength(html) > MAX_HTML_BYTES) {
        return { ...text("HTML exceeds the 900 KB limit"), isError: true };
      }
      const id = crypto.randomUUID().replace(/-/g, "");
      const random = new Uint8Array(32);
      crypto.getRandomValues(random);
      const deletionKey = Buffer.from(random).toString("base64url");
      const deletionKeyHash = createHash("sha256").update(deletionKey).digest("hex");
      const label = title?.trim() || id;
      try {
        const object = await env.PAGES.put(`pages/${id}.html`, html, {
          onlyIf: { etagDoesNotMatch: "*" },
          httpMetadata: { contentType: "text/html; charset=utf-8" },
          customMetadata: { title: label, deletionKeyHash },
        });
        if (!object) return { ...text("Could not publish page; retry"), isError: true };
        return text(
          `Published "${label}"\n${base}/p/${id}\nDeletion key (store it; shown once): ${deletionKey}`,
        );
      } catch {
        return { ...text("Storage unavailable; could not publish page"), isError: true };
      }
    },
  );
  server.registerTool(
    "list_pages",
    {
      description:
        "List up to 100 pages in object-key order. Pass nextCursor as cursor to continue.",
      inputSchema: z.object({ cursor: z.string().max(4096).optional() }).default({}),
    },
    async ({ cursor }) => {
      try {
        const listing = await listPages(env.PAGES, base, cursor);
        return text(
          JSON.stringify({
            items: listing.items,
            ...(listing.nextCursor ? { nextCursor: listing.nextCursor } : {}),
          }),
        );
      } catch {
        return { ...text("Unable to list pages; check cursor or retry"), isError: true };
      }
    },
  );
  server.registerTool(
    "delete_page",
    {
      description:
        "Permanently delete a page. Requires the deletion key returned at upload. Pages without a deletion key can only be deleted from the owner dashboard.",
      inputSchema: {
        id: z.string().regex(PAGE_ID),
        deletionKey: z.string().min(1).max(256),
      },
    },
    async ({ id, deletionKey }) => {
      try {
        const object = await findPage(env.PAGES, id, (key) => env.PAGES.head(key));
        if (!object) return text(`No page with id ${id}.`);
        const storedHash = object.customMetadata?.["deletionKeyHash"];
        if (!storedHash) {
          return {
            ...text(
              "Page has no deletion key; delete it from the owner dashboard instead.",
            ),
            isError: true,
          };
        }
        const suppliedHash = createHash("sha256").update(deletionKey).digest("hex");
        const a = Buffer.from(suppliedHash, "hex");
        const b = Buffer.from(storedHash, "hex");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return { ...text("Deletion key is incorrect."), isError: true };
        }
        await env.PAGES.delete(object.key);
        return text(`Deleted ${id}.`);
      } catch {
        return { ...text("Storage unavailable; could not delete page"), isError: true };
      }
    },
  );
  // No sessionIdGenerator: session management stays disabled, one request per
  // transport. Under exactOptionalPropertyTypes the key is omitted rather than
  // set to undefined, which the SDK reads the same way.
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody });
    response.headers.set("cache-control", "no-store");
    return response;
  } finally {
    await server.close();
  }
}
