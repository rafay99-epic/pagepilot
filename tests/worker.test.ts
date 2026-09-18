import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { SignJWT } from "jose";
import { generateKeyPairSync } from "node:crypto";
import { readdirSync } from "node:fs";

const key = "local-test-key-not-a-production-secret";
const base = "https://pagepilot.test";
// Wrangler emits the landing page as a hashed text module beside the bundle,
// so every Miniflare instance loads the bundle plus whatever HTML dist holds.
const workerModules = [
  { type: "ESModule" as const, path: "dist/index.js" },
  ...readdirSync("dist")
    .filter((name) => name.endsWith(".html"))
    .map((name) => ({ type: "Text" as const, path: `dist/${name}` })),
];
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: workerModules,
    modulesRoot: "dist",
    compatibilityDate: "2026-09-16",
    compatibilityFlags: ["nodejs_compat"],
    r2Buckets: ["PAGES"],
    bindings: { PAGEPILOT_API_KEY: key },
  }),
);

const deletionKey = (result: { text: string }) =>
  /Deletion key \(store it; shown once\): (\S+)/.exec(result.text)?.[1];

before(async () => {
  await mf.ready;
});
after(async () => {
  await mf.dispose();
});

// Every value JSON.parse can produce, which is everything a JSON-RPC call can
// carry as params or tool arguments.
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

async function rpc(method: string, params?: Json) {
  const response = await mf.dispatchFetch(`${base}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json();
}

const resultSchema = z.object({
  result: z.object({
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })),
    isError: z.boolean().optional(),
  }),
});

async function callTool(name: string, args?: Json) {
  const result = resultSchema.parse(
    await rpc("tools/call", {
      name,
      ...(args === undefined ? {} : { arguments: args }),
    }),
  ).result;
  const text = result.content[0]?.text;
  assert.ok(text);
  return { text, isError: result.isError };
}

const listingSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z.string(),
      createdAt: z.string(),
    }),
  ),
  nextCursor: z.string().optional(),
});

async function publish(html = "<!doctype html><h1>Hello</h1>", title = "Test") {
  const result = await callTool("deploy_page", { html, title });
  assert.ok(!result.isError, result.text);
  const url = result.text.split("\n")[1];
  assert.ok(url);
  const id = url.split("/").at(-1);
  assert.ok(id);
  assert.match(id, /^[a-f0-9]{32}$/);
  assert.equal(new URL(url).origin, base);
  const dk = deletionKey(result);
  assert.ok(dk);
  return { id, url, deletionKey: dk };
}

test("backend starts; API key protects all MCP methods and origins", async () => {
  assert.equal(await (await mf.dispatchFetch(`${base}/health`)).text(), "ok");
  assert.equal((await mf.dispatchFetch(`${base}/`)).status, 200);
  assert.equal((await mf.dispatchFetch(`${base}/dashboard`)).status, 503);
  for (const method of ["POST", "GET", "DELETE", "OPTIONS"]) {
    const response = await mf.dispatchFetch(`${base}/api/mcp`, { method });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
  }
  assert.equal(
    (
      await mf.dispatchFetch(`${base}/api/mcp`, {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      })
    ).status,
    401,
  );
  assert.equal(
    (await mf.dispatchFetch(`${base}/api/mcp?key=${key}`, { method: "POST" })).status,
    401,
  );
  assert.equal(
    (
      await mf.dispatchFetch(`${base}/api/mcp`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, origin: "https://untrusted.test" },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await mf.dispatchFetch(`${base}/api/mcp`, {
        headers: { authorization: `Bearer ${key}` },
      })
    ).status,
    405,
  );
});

test("missing key fails closed", async () => {
  const unconfigured = new Miniflare(
    convertV4MiniflareOptions({
      modules: workerModules,
      modulesRoot: "dist",
      compatibilityDate: "2026-09-16",
      compatibilityFlags: ["nodejs_compat"],
      r2Buckets: ["PAGES"],
    }),
  );
  try {
    assert.equal(
      (await unconfigured.dispatchFetch(`${base}/api/mcp`, { method: "POST" })).status,
      503,
    );
  } finally {
    await unconfigured.dispose();
  }
});

test("official MCP client initializes, discovers and invokes tools", async () => {
  const client = new Client({ name: "pagepilot-test", version: "1.0.0" });
  // The SDK types sessionId as an optional string but the client class exposes
  // `string | undefined`, which exactOptionalPropertyTypes rejects. Nothing
  // here reads the session id, so drop it from the type we hand to connect().
  const transport: Omit<Transport, "sessionId"> = new StreamableHTTPClientTransport(
    new URL("/api/mcp", await mf.ready),
    {
      requestInit: { headers: { authorization: `Bearer ${key}` } },
    },
  );
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      "delete_page",
      "deploy_page",
      "list_pages",
    ]);
    const listing = await client.callTool({ name: "list_pages" });
    assert.ok(!listing.isError);
  } finally {
    await client.close();
  }
});

test("publish, list without arguments, stream, conditional GET, HEAD and delete", async () => {
  const html = "<!doctype html><h1>Unicode café</h1>";
  const { id, url, deletionKey } = await publish(html, "Unicode café");
  const bucket = await mf.getR2Bucket("PAGES");
  assert.ok(await bucket.head(`pages/${id}.html`));
  const listing = listingSchema.parse(JSON.parse((await callTool("list_pages")).text));
  assert.equal(listing.items.find((page) => page.id === id)?.title, "Unicode café");
  const response = await mf.dispatchFetch(url);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), html);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /sandbox allow-scripts allow-popups;/,
  );
  assert.ok(
    !response.headers.get("content-security-policy")?.includes("allow-same-origin"),
  );
  const etag = response.headers.get("etag");
  assert.ok(etag);
  for (const condition of [etag, `W/${etag}`, `"other", W/${etag}`, "*"]) {
    const cached = await mf.dispatchFetch(url, {
      headers: { "if-none-match": condition },
    });
    assert.equal(cached.status, 304);
    assert.ok(cached.headers.get("content-security-policy"));
    assert.equal(await cached.text(), "");
  }
  const head = await mf.dispatchFetch(url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal((await mf.dispatchFetch(url, { method: "POST" })).status, 405);
  assert.ok((await callTool("delete_page", { id })).isError);
  assert.ok((await callTool("delete_page", { id, deletionKey: "wrong-key" })).isError);
  assert.ok(!(await callTool("delete_page", { id, deletionKey })).isError);
  assert.equal((await mf.dispatchFetch(url)).status, 404);
  assert.equal(await bucket.head(`pages/${id}.html`), null);
  const replay = await callTool("delete_page", { id, deletionKey });
  assert.ok(!replay.isError);
  assert.match(replay.text, /No page with id/);
});

test("legacy title-in-key pages retain links, listing and deletion", async () => {
  const bucket = await mf.getR2Bucket("PAGES");
  const id = "012345abcdef";
  const title = "Legacy café";
  const oldKey = `pages/${id}~${Buffer.from(title).toString("base64url")}.html`;
  await bucket.put(oldKey, "<h1>Old page</h1>");
  assert.equal(
    await (await mf.dispatchFetch(`${base}/p/${id}`)).text(),
    "<h1>Old page</h1>",
  );
  const listing = listingSchema.parse(JSON.parse((await callTool("list_pages")).text));
  assert.equal(listing.items.find((page) => page.id === id)?.title, title);
  const legacyResult = await callTool("delete_page", { id, deletionKey: "irrelevant" });
  assert.ok(legacyResult.isError);
  assert.match(legacyResult.text, /owner dashboard/);
  assert.ok(await bucket.head(oldKey), "legacy page must survive MCP delete");
  await bucket.delete(oldKey);
  assert.equal(await bucket.head(oldKey), null);
  assert.equal((await mf.dispatchFetch(`${base}/p/${id}`)).status, 404);
});

test("paginated listings expose every page and preserve metadata", async () => {
  const bucket = await mf.getR2Bucket("PAGES");
  for (let index = 0; index < 103; index++) {
    await bucket.put(
      `pages/${index.toString(16).padStart(32, "0")}.html`,
      "<p>page</p>",
      {
        customMetadata: { title: `Page ${index}` },
      },
    );
  }
  const first = listingSchema.parse(JSON.parse((await callTool("list_pages")).text));
  assert.equal(first.items.length, 100);
  assert.ok(first.nextCursor);
  const second = listingSchema.parse(
    JSON.parse((await callTool("list_pages", { cursor: first.nextCursor })).text),
  );
  assert.equal(second.items.length, 3);
  assert.equal(second.nextCursor, undefined);
  assert.equal(
    new Set([...first.items, ...second.items].map((page) => page.id)).size,
    103,
  );
  assert.equal(first.items[0]?.title, "Page 0");
  await bucket.delete(
    [...first.items, ...second.items].map((page) => `pages/${page.id}.html`),
  );
});

test("upload validation checks UTF-8 bytes and malformed input", async () => {
  assert.ok((await callTool("deploy_page", { html: "" })).isError);
  assert.ok((await callTool("deploy_page", { html: "x".repeat(900_001) })).isError);
  assert.ok((await callTool("deploy_page", { html: "é".repeat(450_001) })).isError);
  assert.ok((await callTool("delete_page", { id: "not-an-id" })).isError);
  const { id, deletionKey } = await publish("é".repeat(450_000));
  await callTool("delete_page", { id, deletionKey });
  const response = await mf.dispatchFetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: "{invalid",
  });
  assert.equal(response.status, 400);
  const oversized = await mf.dispatchFetch(`${base}/api/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: "x".repeat(5_416_385),
  });
  assert.equal(oversized.status, 413);
});

test("production canonical URL overrides preview request origin", async () => {
  const production = new Miniflare(
    convertV4MiniflareOptions({
      modules: workerModules,
      modulesRoot: "dist",
      compatibilityDate: "2026-09-16",
      compatibilityFlags: ["nodejs_compat"],
      r2Buckets: ["PAGES"],
      bindings: { PAGEPILOT_API_KEY: key, PUBLIC_URL: "https://pagepilot.rafay99.com" },
    }),
  );
  try {
    const response = await production.dispatchFetch(`${base}/api/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "deploy_page", arguments: { html: "<p>local test</p>" } },
      }),
    });
    const result = resultSchema.parse(await response.json());
    assert.ok(!result.result.isError);
    assert.match(
      result.result.content[0]?.text ?? "",
      /https:\/\/pagepilot\.rafay99\.com\/p\/[a-f0-9]{32}/,
    );
  } finally {
    await production.dispose();
  }
});

const accessDomain = "test-team.cloudflareaccess.com";
const accessAud = "access-aud-test";
const ownerEmail = "owner@example.com";

const { publicKey: accessKey, privateKey: accessPrivateKey } = generateKeyPairSync(
  "rsa",
  {
    modulusLength: 2048,
  },
);
const accessJwk = {
  ...accessKey.export({ format: "jwk" }),
  kid: "test-kid",
  alg: "RS256",
  use: "sig",
};

function signAccessJwt(
  claims: { email?: string } = {},
  options: { iss?: string; aud?: string; exp?: string | number } = {},
) {
  return new SignJWT({ email: claims.email ?? ownerEmail })
    .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
    .setIssuer(options.iss ?? `https://${accessDomain}`)
    .setAudience(options.aud ?? accessAud)
    .setIssuedAt()
    .setExpirationTime(options.exp ?? "5m")
    .sign(accessPrivateKey);
}

const accessMf = new Miniflare(
  convertV4MiniflareOptions({
    modules: workerModules,
    modulesRoot: "dist",
    compatibilityDate: "2026-09-16",
    compatibilityFlags: ["nodejs_compat"],
    r2Buckets: ["PAGES"],
    bindings: {
      PAGEPILOT_API_KEY: key,
      ACCESS_TEAM_DOMAIN: accessDomain,
      ACCESS_AUD: accessAud,
      OWNER_EMAIL: ownerEmail,
    },
    serviceBindings: {
      ASSETS: async (request) => {
        const url = new URL(request.url);
        if (url.pathname === "/dashboard/") {
          return new Response("<!doctype html><title>PagePilot</title>", {
            headers: { "content-type": "text/html" },
          });
        }
        return new Response("asset not found", { status: 404 });
      },
    },
    outboundService: (request: Request) => {
      if (request.url === `https://${accessDomain}/cdn-cgi/access/certs`) {
        return Response.json({ keys: [accessJwk] });
      }
      return new Response("mock: not found", { status: 404 });
    },
  }),
);

test.after(async () => {
  await accessMf.dispose();
});

async function dashboard(
  path: string,
  init: { method?: string; headers?: Record<string, string>; token?: string | null } = {},
) {
  const { token, headers, ...rest } = init;
  const merged: Record<string, string> = { ...headers };
  if (token !== null)
    merged["cf-access-jwt-assertion"] = token ?? (await signAccessJwt());
  return accessMf.dispatchFetch(`${base}${path}`, { ...rest, headers: merged });
}

test("dashboard fails closed without Access configuration", async () => {
  for (const path of ["/dashboard", "/dashboard/app.js", "/api/dashboard/pages"]) {
    const response = await mf.dispatchFetch(`${base}${path}`);
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("dashboard rejects missing, tampered, expired and mismatched tokens", async () => {
  for (const token of [
    null,
    "not-a-jwt",
    await signAccessJwt({ email: "intruder@evil.test" }),
    await signAccessJwt({}, { exp: -10 }),
    await signAccessJwt({}, { iss: "https://evil.cloudflareaccess.com" }),
    await signAccessJwt({}, { aud: "wrong-aud" }),
  ]) {
    const response = await dashboard("/api/dashboard/pages", { token });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(await response.json());
  }
  const wrongKey = await new Miniflare(
    convertV4MiniflareOptions({
      modules: workerModules,
      modulesRoot: "dist",
      compatibilityDate: "2026-09-16",
      compatibilityFlags: ["nodejs_compat"],
      r2Buckets: ["PAGES"],
      bindings: {
        PAGEPILOT_API_KEY: key,
        ACCESS_TEAM_DOMAIN: "other-team.cloudflareaccess.com",
        ACCESS_AUD: accessAud,
        OWNER_EMAIL: ownerEmail,
      },
    }),
  );
  try {
    const response = await wrongKey.dispatchFetch(`${base}/api/dashboard/pages`, {
      headers: { "Cf-Access-Jwt-Assertion": await signAccessJwt() },
    });
    assert.equal(response.status, 403);
  } finally {
    await wrongKey.dispose();
  }
});

test("dashboard assets require owner authentication", async () => {
  const denied = await dashboard("/dashboard/", { token: null });
  assert.equal(denied.status, 403);
  const allowed = await dashboard("/dashboard/");
  assert.equal(allowed.status, 200);
  assert.match(await allowed.text(), /PagePilot/);
  assert.equal(allowed.headers.get("cache-control"), "no-store");
  assert.match(
    allowed.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
});

test("dashboard owner lists and deletes with origin and legacy handling", async () => {
  const bucket = await accessMf.getR2Bucket("PAGES");
  const deploy = await accessMf.dispatchFetch(`${base}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "deploy_page", arguments: { html: "<p>dash</p>", title: "Dash" } },
    }),
  });
  const deployResult = resultSchema.parse(await deploy.json()).result;
  assert.ok(!deployResult.isError);
  const deployed = deployResult.content[0]?.text.split("\n")[1];
  assert.ok(deployed);
  const id = deployed.split("/").at(-1);
  assert.ok(id);
  await bucket.put(
    `pages/012345abcdef~${Buffer.from("Old").toString("base64url")}.html`,
    "<p>old</p>",
  );

  const listing = listingSchema.parse(
    await (await dashboard("/api/dashboard/pages")).json(),
  );
  assert.ok(listing.items.find((page) => page.id === id));
  assert.ok(!("deletionKeyHash" in (listing.items[0] ?? {})));

  const second = await dashboard("/api/dashboard/pages", {
    headers: { origin: "https://untrusted.test" },
  });
  assert.equal(second.status, 200);

  const deleteWithOrigin = await dashboard(`/api/dashboard/pages/${id}`, {
    method: "DELETE",
    headers: { origin: base },
  });
  assert.equal(deleteWithOrigin.status, 200);
  assert.equal(await bucket.head(`pages/${id}.html`), null);

  const crossOrigin = await dashboard(`/api/dashboard/pages/012345abcdef`, {
    method: "DELETE",
    headers: { origin: "https://untrusted.test" },
  });
  assert.equal(crossOrigin.status, 403);
  assert.ok(
    await bucket.head(
      `pages/012345abcdef~${Buffer.from("Old").toString("base64url")}.html`,
    ),
  );

  const deleteMissingOrigin = await dashboard(`/api/dashboard/pages/012345abcdef`, {
    method: "DELETE",
  });
  assert.equal(deleteMissingOrigin.status, 403);

  const deleteNotFound = await dashboard(
    "/api/dashboard/pages/ffffffffffffffffffffffffffffffff",
    {
      method: "DELETE",
      headers: { origin: base },
    },
  );
  assert.equal(deleteNotFound.status, 404);
  assert.ok(
    await bucket.head(
      `pages/012345abcdef~${Buffer.from("Old").toString("base64url")}.html`,
    ),
  );
  const deleteLegacy = await dashboard("/api/dashboard/pages/012345abcdef", {
    method: "DELETE",
    headers: { origin: base },
  });
  assert.equal(deleteLegacy.status, 200);
  assert.equal(
    await bucket.head(
      `pages/012345abcdef~${Buffer.from("Old").toString("base64url")}.html`,
    ),
    null,
  );
});

test("dashboard preview is owner-only and framable only by the dashboard", async () => {
  const bucket = await accessMf.getR2Bucket("PAGES");
  await bucket.put("pages/abcdef012345.html", "<p>preview</p>");
  const path = "/api/dashboard/pages/abcdef012345/preview";

  const anonymous = await dashboard(path, { token: null });
  assert.equal(anonymous.status, 403);

  const preview = await dashboard(path);
  assert.equal(preview.status, 200);
  assert.equal(await preview.text(), "<p>preview</p>");
  const csp = preview.headers.get("content-security-policy") ?? "";
  assert.match(csp, /^sandbox allow-scripts allow-popups;/);
  assert.match(csp, /frame-ancestors 'self'$/);

  const shared = await accessMf.dispatchFetch(`${base}/p/abcdef012345`);
  await shared.body?.cancel();
  assert.match(
    shared.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'$/,
  );
});

// Mirrors storageReportSchema in shared/api.ts; the NodeNext test config
// cannot import that module without a .ts extension import.
const count = z.number().int().nonnegative();
const storageSchema = z.object({
  usedBytes: count,
  freeTierBytes: count,
  objectCount: count,
  pageCount: count,
  complete: z.boolean(),
  months: z.array(
    z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), bytes: count, pages: count }),
  ),
  largest: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.string().url(),
        createdAt: z.string().datetime(),
        bytes: count,
      }),
    )
    .max(10),
});

test("storage report is owner-only and counts pages apart from other objects", async () => {
  const anonymous = await dashboard("/api/dashboard/storage", { token: null });
  assert.equal(anonymous.status, 403);

  const bucket = await accessMf.getR2Bucket("PAGES");
  const existing = await bucket.list();
  if (existing.objects.length > 0) {
    await bucket.delete(existing.objects.map((object) => object.key));
  }
  const bigId = "a".repeat(32);
  const smallId = "b0".repeat(16);
  await bucket.put(`pages/${bigId}.html`, "x".repeat(400), {
    customMetadata: { title: "Big" },
  });
  await bucket.put(`pages/${smallId}.html`, "x".repeat(50));
  await bucket.put("uploads/notes.txt", "x".repeat(7));

  const response = await dashboard("/api/dashboard/storage");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const report = storageSchema.parse(await response.json());
  assert.equal(report.usedBytes, 457);
  assert.equal(report.objectCount, 3);
  assert.equal(report.pageCount, 2);
  assert.equal(report.freeTierBytes, 10_000_000_000);
  assert.equal(report.complete, true);
  assert.deepEqual(report.months, [
    { month: new Date().toISOString().slice(0, 7), bytes: 450, pages: 2 },
  ]);
  assert.deepEqual(
    report.largest.map((page) => [page.id, page.bytes, page.title]),
    [
      [bigId, 400, "Big"],
      [smallId, 50, smallId],
    ],
  );
  assert.equal(report.largest[0]?.url, `${base}/p/${bigId}`);
});

test("landing page answers GET and HEAD at the root", async () => {
  const response = await mf.dispatchFetch(`${base}/`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(response.headers.get("cache-control"), "public, max-age=300");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(
    response.headers.get("content-security-policy"),
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  );
  assert.match(await response.text(), /PagePilot/);

  const head = await mf.dispatchFetch(`${base}/`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});
