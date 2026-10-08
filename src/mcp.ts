import { createHash, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { PAGE_ID } from "../shared/api";
import { ASSET_TYPES, assetKeys, createUpload } from "./assets";
import { holdAssets, settleAssets } from "./ledger";
import type { Env } from "./env";
import { errorResponse, publicBase } from "./http";
import type { Json } from "./http";
import {
  findPage,
  legacyKey,
  listPages,
  pageFilter,
  pageRecord,
  removePage,
} from "./pages";

const MAX_HTML_BYTES = 900_000;
const MAX_REQUEST_BYTES = 6 * MAX_HTML_BYTES + 16_384;
const HTML_METADATA = { contentType: "text/html; charset=utf-8" };

function text(...blocks: string[]) {
  return { content: blocks.map((text) => ({ type: "text" as const, text })) };
}

function isObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(message: string) {
  return { ...text(message), isError: true };
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
  const apiKey = env.PAGEPILOT_API_KEY;
  if (!apiKey) return errorResponse(503, "API key is not configured");
  if (!isAuthed(request, apiKey)) {
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
  // A call without arguments means none, which list_pages accepts. The SDK
  // would reject it, so the empty object is filled in here.
  if (
    isObject(parsedBody) &&
    parsedBody["method"] === "tools/call" &&
    isObject(parsedBody["params"])
  ) {
    parsedBody["params"]["arguments"] ??= {};
  }

  const base = publicBase(request, env);
  const server = new McpServer({ name: "pagepilot", version: "3.1.0" });
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
        return failure("HTML exceeds the 900 KB limit");
      }
      const id = crypto.randomUUID().replace(/-/g, "");
      const random = new Uint8Array(32);
      crypto.getRandomValues(random);
      const deletionKey = Buffer.from(random).toString("base64url");
      const deletionKeyHash = createHash("sha256").update(deletionKey).digest("hex");
      const label = title?.trim() || id;
      try {
        // Images are recorded first: see holdAssets for why that must not fail.
        const embedded = assetKeys(html);
        if (embedded.length > 0) await holdAssets(env, id, embedded);
        const object = await env.PAGES.put(`pages/${id}.html`, html, {
          onlyIf: { etagDoesNotMatch: "*" },
          httpMetadata: HTML_METADATA,
          customMetadata: { title: label, deletionKeyHash },
        });
        if (!object) return failure("Could not publish page; retry");
        return text(
          `Published "${label}"\n${base}/p/${id}\nDeletion key (store it; shown once): ${deletionKey}`,
        );
      } catch {
        return failure("Storage unavailable; could not publish page");
      }
    },
  );
  server.registerTool(
    "update_page",
    {
      description:
        "Replace the HTML of an existing page. The link stays the same. Pass title to rename it. An uploaded image no page embeds any more is deleted a day later. Maximum 900,000 UTF-8 bytes.",
      inputSchema: {
        id: z.string().regex(PAGE_ID),
        html: z.string().min(1).max(MAX_HTML_BYTES),
        title: z.string().max(120).optional(),
      },
    },
    async ({ id, html, title }) => {
      if (Buffer.byteLength(html) > MAX_HTML_BYTES) {
        return failure("HTML exceeds the 900 KB limit");
      }
      try {
        const existing = await findPage(env.PAGES, id, (key) => env.PAGES.head(key));
        const record = existing && pageRecord(existing, base);
        if (!existing || !record) return failure(`No page with id ${id}.`);
        const label = title?.trim() || record.title;
        const deletionKeyHash = existing.customMetadata?.["deletionKeyHash"];
        const key = `pages/${id}.html`;
        const held = await holdAssets(env, id, assetKeys(html));
        // Lose a race rather than overwrite blindly: the page must still be
        // the one just read. A legacy page keeps its title in the key, so its
        // first update moves it to the current key, which must be free.
        const written = await env.PAGES.put(key, html, {
          onlyIf:
            existing.key === key
              ? { etagMatches: existing.etag }
              : { etagDoesNotMatch: "*" },
          httpMetadata: HTML_METADATA,
          customMetadata: {
            title: label,
            createdAt: record.createdAt,
            ...(deletionKeyHash ? { deletionKeyHash } : {}),
          },
        });
        if (!written) {
          return failure("Page changed during the update; read it again and retry");
        }
        // The new HTML is live. What follows is cleanup, so a failure only
        // keeps something longer: the legacy object this page may have moved
        // from, and the images it no longer embeds.
        const legacy = await legacyKey(env.PAGES, id).catch(() => undefined);
        if (legacy) await env.PAGES.delete(legacy).catch(() => undefined);
        if (held !== undefined) await settleAssets(env, id, held);
        return text(`Updated "${label}"\n${base}/p/${id}`);
      } catch {
        return failure("Storage unavailable; could not update page");
      }
    },
  );
  server.registerTool(
    "get_page",
    {
      description:
        "Read a page back: its details as JSON, then the exact HTML as a second text block. A page can be up to 900 KB; list_pages shows bytes.",
      inputSchema: { id: z.string().regex(PAGE_ID) },
    },
    async ({ id }) => {
      try {
        const object = await findPage(env.PAGES, id, (key) => env.PAGES.get(key));
        const record = object && pageRecord(object, base);
        if (!object || !record) return failure(`No page with id ${id}.`);
        return text(JSON.stringify(record), await object.text());
      } catch {
        return failure("Storage unavailable; could not read page");
      }
    },
  );
  server.registerTool(
    "list_pages",
    {
      description:
        "List pages, newest update first. after and before bound the update time (ISO 8601 with offset). query matches title or id. limit is 1 to 100, default 20. Pass nextCursor as cursor to continue.",
      inputSchema: pageFilter,
    },
    async (filter) => {
      // Every call scans the whole vault, so this one tool is rate limited.
      // A limiter that is missing or failing lets the call through.
      const outcome = await env.LIST_LIMITER?.limit({ key: "list_pages" }).catch(
        () => undefined,
      );
      if (outcome?.success === false) {
        return failure("Rate limit reached for list_pages; retry in a minute");
      }
      try {
        return text(JSON.stringify(await listPages(env.PAGES, base, filter)));
      } catch {
        return failure("Unable to list pages; check cursor or retry");
      }
    },
  );
  server.registerTool(
    "create_upload_url",
    {
      description:
        "Get a one-use URL for uploading an image from the shell with curl, plus the URL to embed in a page. PNG, JPEG, WebP, GIF or AVIF, up to 10 MB. Use this instead of inlining base64.",
      inputSchema: { contentType: z.enum(ASSET_TYPES) },
    },
    ({ contentType }) => {
      const { uploadUrl, assetUrl } = createUpload(apiKey, base, contentType);
      return text(
        `Upload the file:\ncurl -T <file> "${uploadUrl}"\nThen embed: ${assetUrl}\nThe upload URL works once and expires in 10 minutes.`,
      );
    },
  );
  server.registerTool(
    "delete_page",
    {
      description:
        "Permanently delete a page. Uploaded images only it embeds are deleted a day later. Requires the deletion key returned at upload. Pages without a deletion key can only be deleted from the owner dashboard.",
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
          return failure(
            "Page has no deletion key; delete it from the owner dashboard instead.",
          );
        }
        const suppliedHash = createHash("sha256").update(deletionKey).digest("hex");
        const a = Buffer.from(suppliedHash, "hex");
        const b = Buffer.from(storedHash, "hex");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return failure("Deletion key is incorrect.");
        }
        await removePage(env, id, object.key);
        return text(`Deleted ${id}.`);
      } catch {
        return failure("Storage unavailable; could not delete page");
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
