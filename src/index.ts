import { timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

interface Env {
  PAGES: R2Bucket;
  PAGEPILOT_API_KEY?: string;
  PUBLIC_URL?: string;
}

const MAX_HTML_BYTES = 900_000;
const MAX_REQUEST_BYTES = 6 * MAX_HTML_BYTES + 16_384;
const ID = /^(?:[a-f0-9]{12}|[a-f0-9]{32})$/;
const KEY = /^pages\/([a-f0-9]{12}|[a-f0-9]{32})(?:~([A-Za-z0-9_-]*))?\.html$/;
const SECURITY_HEADERS = {
  "x-robots-tag": "noindex, nofollow, noarchive",
  "content-security-policy": [
    "sandbox allow-scripts allow-popups",
    "default-src 'none'",
    "script-src 'unsafe-inline' https:",
    "style-src 'unsafe-inline' https:",
    "img-src data: blob: https:",
    "font-src data: https:",
    "connect-src https:",
    "media-src blob: https:",
    "frame-src https:",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "cache-control": "private, no-store",
};

function text(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function errorResponse(status: number, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message }, id: null },
    {
      status,
      headers: {
        "cache-control": "no-store",
        ...(status === 401 ? { "www-authenticate": "Bearer" } : {}),
      },
    },
  );
}

function isAuthed(request: Request, key: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(key);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function legacyKey(bucket: R2Bucket, id: string): Promise<string | undefined> {
  if (id.length !== 12) return undefined;
  const listing = await bucket.list({ prefix: `pages/${id}~`, limit: 1 });
  const key = listing.objects[0]?.key;
  return key && KEY.test(key) ? key : undefined;
}

function pageRecord(object: R2Object, base: string) {
  const match = KEY.exec(object.key);
  if (!match?.[1]) return null;
  const id = match[1];
  const encoded = match[2];
  let title = object.customMetadata?.title || id;
  if (encoded) {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    title = Buffer.from(decoded).toString("base64url") === encoded ? decoded : encoded;
  }
  return { id, title, url: `${base}/p/${id}`, createdAt: object.uploaded.toISOString() };
}

async function handleMcp(request: Request, env: Env): Promise<Response> {
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
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return errorResponse(400, "Invalid JSON");
  }

  const base = env.PUBLIC_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
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
      const label = title?.trim() || id;
      try {
        const object = await env.PAGES.put(`pages/${id}.html`, html, {
          onlyIf: { etagDoesNotMatch: "*" },
          httpMetadata: { contentType: "text/html; charset=utf-8" },
          customMetadata: { title: label },
        });
        if (!object) return { ...text("Could not publish page; retry"), isError: true };
        return text(`Published "${label}"\n${base}/p/${id}`);
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
        const listing = await env.PAGES.list({
          prefix: "pages/",
          limit: 100,
          include: ["customMetadata"],
          ...(cursor ? { cursor } : {}),
        });
        const items = listing.objects.flatMap((object) => {
          const record = pageRecord(object, base);
          return record ? [record] : [];
        });
        return text(
          JSON.stringify({
            items,
            ...(listing.truncated ? { nextCursor: listing.cursor } : {}),
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
      description: "Permanently delete a page. Future uncached requests return 404.",
      inputSchema: { id: z.string().regex(ID) },
    },
    async ({ id }) => {
      try {
        const direct = await env.PAGES.head(`pages/${id}.html`);
        const key = direct?.key ?? (await legacyKey(env.PAGES, id));
        if (!key) return text(`No page with id ${id}.`);
        await env.PAGES.delete(key);
        return text(`Deleted ${id}.`);
      } catch {
        return { ...text("Storage unavailable; could not delete page"), isError: true };
      }
    },
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
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

async function servePage(request: Request, env: Env, id: string): Promise<Response> {
  if (!ID.test(id))
    return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { ...SECURITY_HEADERS, allow: "GET, HEAD" },
    });
  }
  let object = await env.PAGES.get(`pages/${id}.html`);
  if (!object) {
    const key = await legacyKey(env.PAGES, id);
    if (key) object = await env.PAGES.get(key);
  }
  if (!object)
    return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  const headers = {
    ...SECURITY_HEADERS,
    "content-type": "text/html; charset=utf-8",
    etag: object.httpEtag,
  };
  const condition = request.headers.get("if-none-match");
  const matches = condition?.split(",").some((tag) => {
    const normalized = tag.trim().replace(/^W\//, "");
    return normalized === "*" || normalized === object.httpEtag;
  });
  if (matches || request.method === "HEAD") {
    await object.body.cancel();
    return new Response(null, { status: matches ? 304 : 200, headers });
  }
  return new Response(object.body, { headers });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/mcp") return await handleMcp(request, env);
      if (url.pathname.startsWith("/p/")) {
        return await servePage(request, env, url.pathname.slice(3));
      }
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        url.pathname === "/health"
      ) {
        return new Response(request.method === "HEAD" ? null : "ok", {
          headers: { "content-type": "text/plain", "cache-control": "no-store" },
        });
      }
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        url.pathname === "/robots.txt"
      ) {
        return new Response(
          request.method === "HEAD" ? null : "User-agent: *\nDisallow: /\n",
          {
            headers: { "content-type": "text/plain" },
          },
        );
      }
      return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
    } catch {
      return errorResponse(500, "Request failed; retry later");
    }
  },
} satisfies ExportedHandler<Env>;
