import { createHash, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { createRemoteJWKSet, jwtVerify } from "jose";

interface Env {
  PAGES: R2Bucket;
  PAGEPILOT_API_KEY?: string;
  PUBLIC_URL?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  OWNER_EMAIL?: string;
  ASSETS?: Fetcher;
}

const MAX_HTML_BYTES = 900_000;
const MAX_REQUEST_BYTES = 6 * MAX_HTML_BYTES + 16_384;
const ID = /^(?:[a-f0-9]{12}|[a-f0-9]{32})$/;
const KEY = /^pages\/([a-f0-9]{12}|[a-f0-9]{32})(?:~([A-Za-z0-9_-]*))?\.html$/;
// Policy for stored pages. Public links refuse framing; the owner preview
// route passes 'self' so only the dashboard can embed a page.
function pageCsp(frameAncestors: "'none'" | "'self'"): string {
  return [
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
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}

const SECURITY_HEADERS = {
  "x-robots-tag": "noindex, nofollow, noarchive",
  "content-security-policy": pageCsp("'none'"),
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

function publicBase(request: Request, env: Env): string {
  return env.PUBLIC_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
}

async function listPages(bucket: R2Bucket, base: string, cursor?: string) {
  const listing = await bucket.list({
    prefix: "pages/",
    limit: 100,
    include: ["customMetadata"],
    ...(cursor ? { cursor } : {}),
  });
  const items = listing.objects.flatMap((object) => {
    const record = pageRecord(object, base);
    return record ? [record] : [];
  });
  return { items, ...(listing.truncated ? { nextCursor: listing.cursor } : {}) };
}

function dashboardJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

let accessKeys:
  { issuer: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined;

async function authorizeOwner(request: Request, env: Env): Promise<Response | undefined> {
  const domain = env.ACCESS_TEAM_DOMAIN;
  if (
    !domain ||
    domain.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+cloudflareaccess\.com$/.test(domain) ||
    !env.ACCESS_AUD?.trim() ||
    !env.OWNER_EMAIL?.trim()
  ) {
    return dashboardJson({ error: "Dashboard access is not configured" }, 503);
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return dashboardJson({ error: "Forbidden" }, 403);
  try {
    const issuer = `https://${domain}`;
    if (accessKeys?.issuer !== issuer) {
      accessKeys = {
        issuer,
        keys: createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
      };
    }
    const { payload } = await jwtVerify(token, accessKeys.keys, {
      algorithms: ["RS256"],
      issuer,
      audience: env.ACCESS_AUD,
      requiredClaims: ["exp", "email"],
    });
    if (payload.email !== env.OWNER_EMAIL) {
      return dashboardJson({ error: "Forbidden" }, 403);
    }
  } catch {
    return dashboardJson({ error: "Forbidden" }, 403);
  }
}

async function handleDashboard(request: Request, env: Env): Promise<Response> {
  const denied = await authorizeOwner(request, env);
  if (denied) return denied;
  const url = new URL(request.url);
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("origin") !== url.origin
  ) {
    return dashboardJson({ error: "Origin not allowed" }, 403);
  }
  try {
    if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return dashboardJson({ error: "Method not allowed" }, 405);
      }
      if (!env.ASSETS)
        return dashboardJson({ error: "Dashboard assets unavailable" }, 503);
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set("cache-control", "no-store");
      response.headers.set("referrer-policy", "no-referrer");
      response.headers.set("x-content-type-options", "nosniff");
      response.headers.set("x-robots-tag", "noindex, nofollow");
      response.headers.set(
        "content-security-policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
      return response;
    }
    if (url.pathname === "/api/dashboard/pages") {
      if (request.method !== "GET") {
        return dashboardJson({ error: "Method not allowed" }, 405);
      }
      const cursor = url.searchParams.get("cursor") ?? undefined;
      if (cursor && cursor.length > 4096) {
        return dashboardJson({ error: "Invalid cursor" }, 400);
      }
      return dashboardJson(await listPages(env.PAGES, publicBase(request, env), cursor));
    }
    const preview = /^\/api\/dashboard\/pages\/([^/]+)\/preview$/.exec(url.pathname);
    if (preview?.[1]) return await servePage(request, env, preview[1], "'self'");
    if (url.pathname.startsWith("/api/dashboard/pages/")) {
      if (request.method !== "DELETE") {
        return dashboardJson({ error: "Method not allowed" }, 405);
      }
      const id = url.pathname.slice("/api/dashboard/pages/".length);
      if (!ID.test(id)) return dashboardJson({ error: "Invalid page id" }, 400);
      const direct = await env.PAGES.head(`pages/${id}.html`);
      const key = direct?.key ?? (await legacyKey(env.PAGES, id));
      if (!key) return dashboardJson({ error: "Page not found" }, 404);
      await env.PAGES.delete(key);
      return dashboardJson({ id, deleted: true });
    }
    return dashboardJson({ error: "Not found" }, 404);
  } catch {
    return dashboardJson({ error: "Request failed; retry later" }, 500);
  }
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
      inputSchema: { id: z.string().regex(ID), deletionKey: z.string().min(1).max(256) },
    },
    async ({ id, deletionKey }) => {
      try {
        const direct = await env.PAGES.head(`pages/${id}.html`);
        let object = direct;
        if (!object) {
          const legacy = await legacyKey(env.PAGES, id);
          if (legacy) object = await env.PAGES.head(legacy);
        }
        if (!object) return text(`No page with id ${id}.`);
        const storedHash = object.customMetadata?.deletionKeyHash;
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

async function servePage(
  request: Request,
  env: Env,
  id: string,
  frameAncestors: "'none'" | "'self'" = "'none'",
): Promise<Response> {
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
    "content-security-policy": pageCsp(frameAncestors),
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
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/"))
      ) {
        return await handleDashboard(request, env);
      }
      if (url.pathname.startsWith("/api/dashboard/")) {
        return await handleDashboard(request, env);
      }
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
