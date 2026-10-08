import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { SignJWT } from "jose";
import { createHmac, generateKeyPairSync } from "node:crypto";
import { readdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

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
// What every Miniflare instance here starts from.
const worker = {
  modules: workerModules,
  modulesRoot: "dist",
  compatibilityDate: "2026-09-16",
  compatibilityFlags: ["nodejs_compat"],
  r2Buckets: ["PAGES"],
};
// The ledger and the list_pages limiter, for instances that use them.
const stateful = {
  durableObjects: { LEDGER: { className: "Ledger", useSQLite: true } },
  ratelimits: {
    LIST_LIMITER: { namespace_id: "1001", simple: { limit: 1000, period: 60 as const } },
  },
};
const mf = new Miniflare(
  convertV4MiniflareOptions({
    ...worker,
    bindings: { PAGEPILOT_API_KEY: key },
    ...stateful,
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

async function rpc(method: string, params?: Json, instance = mf) {
  const response = await instance.dispatchFetch(`${base}/api/mcp`, {
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

async function callTool(name: string, args?: Json, instance = mf) {
  const result = resultSchema.parse(
    await rpc(
      "tools/call",
      { name, ...(args === undefined ? {} : { arguments: args }) },
      instance,
    ),
  ).result;
  const blocks = result.content.map((block) => block.text);
  const text = blocks[0];
  assert.ok(text);
  return { text, blocks, isError: result.isError };
}

const pageSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  bytes: z.number(),
});
const listingSchema = z.object({
  items: z.array(pageSchema),
  nextCursor: z.string().optional(),
});
// Passthrough, so a field the Worker should never send is still visible.
const dashboardListingSchema = z.object({
  items: z.array(
    pageSchema
      .extend({ views: z.number(), lastViewed: z.string().optional() })
      .passthrough(),
  ),
  complete: z.boolean(),
});

async function listPages(args?: Json) {
  const result = await callTool("list_pages", args);
  assert.ok(!result.isError, result.text);
  return listingSchema.parse(JSON.parse(result.text));
}

async function publish(
  html = "<!doctype html><h1>Hello</h1>",
  title = "Test",
  instance = mf,
) {
  const result = await callTool("deploy_page", { html, title }, instance);
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

// Runs the ledger's cleanup as if a day had passed since the last release.
// Miniflare hands back an untyped stub, hence the cast to the one method used.
async function sweepImages() {
  const ledgers = await mf.getDurableObjectNamespace("LEDGER");
  const ledger = ledgers.get(ledgers.idFromName("ledger")) as unknown as {
    sweep(before: number): Promise<void>;
  };
  await ledger.sweep(Date.now() + 1);
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
      ...worker,
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
      "create_upload_url",
      "delete_page",
      "deploy_page",
      "get_page",
      "list_pages",
      "update_page",
    ]);
    const filters = tools.find((tool) => tool.name === "list_pages")?.inputSchema;
    assert.deepEqual(Object.keys(filters?.properties ?? {}).sort(), [
      "after",
      "before",
      "cursor",
      "limit",
      "query",
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
  const listing = await listPages();
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
  // Over plain HTTP, as in local runs, the page's own origin is allowed for
  // images so uploads load. Over HTTPS the policy is the one pages always had.
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /img-src data: blob: https:;/,
  );
  const local = await mf.dispatchFetch(url.replace("https://", "http://"));
  assert.match(
    local.headers.get("content-security-policy") ?? "",
    /img-src data: blob: https: http:\/\/pagepilot\.test;/,
  );
  await local.body?.cancel();
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

  // A batch is answered too, and a call in it may leave its arguments out.
  const batch = await mf.dispatchFetch(`${base}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "list_pages" } },
    ]),
  });
  // The SDK answers a batch of one with a single object.
  const answers: unknown = await batch.json();
  const answer = resultSchema.parse(Array.isArray(answers) ? answers[0] : answers);
  assert.ok(!answer.result.isError);
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
  const listing = await listPages();
  assert.equal(listing.items.find((page) => page.id === id)?.title, title);
  const legacyResult = await callTool("delete_page", { id, deletionKey: "irrelevant" });
  assert.ok(legacyResult.isError);
  assert.match(legacyResult.text, /owner dashboard/);
  assert.ok(await bucket.head(oldKey), "legacy page must survive MCP delete");
  await bucket.delete(oldKey);
  assert.equal(await bucket.head(oldKey), null);
  assert.equal((await mf.dispatchFetch(`${base}/p/${id}`)).status, 404);
});

test("list_pages walks every page once, newest first, inside a time window", async () => {
  const bucket = await mf.getR2Bucket("PAGES");
  const ids = Array.from({ length: 103 }, (_, index) =>
    index.toString(16).padStart(32, "0"),
  );
  for (const id of ids) {
    await bucket.put(`pages/${id}.html`, "<p>page</p>", {
      customMetadata: { title: `Bulk ${id}` },
    });
  }
  const defaults = await listPages();
  assert.equal(defaults.items.length, 20);
  assert.ok(defaults.nextCursor);

  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await listPages({
      query: "bulk",
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });
    seen.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual([...seen].sort(), ids);
  assert.ok((await callTool("list_pages", { cursor: "not-a-cursor" })).isError);
  await bucket.delete(ids.map((id) => `pages/${id}.html`));

  const mark = new Date().toISOString();
  await delay(5);
  const older = await publish("<p>a</p>", "Window A");
  await delay(5);
  const newer = await publish("<p>bb</p>", "Window B");
  const recent = await listPages({ after: mark });
  assert.deepEqual(
    recent.items.map((item) => [item.id, item.bytes]),
    [
      [newer.id, 9],
      [older.id, 8],
    ],
  );
  assert.equal((await listPages({ before: mark, query: "window" })).items.length, 0);
  assert.ok((await callTool("list_pages", { after: "yesterday" })).isError);
  await bucket.delete([`pages/${older.id}.html`, `pages/${newer.id}.html`]);
});

test("list_pages is rate limited", async () => {
  const limited = new Miniflare(
    convertV4MiniflareOptions({
      ...worker,
      bindings: { PAGEPILOT_API_KEY: key },
      ...stateful,
      ratelimits: {
        LIST_LIMITER: { namespace_id: "1001", simple: { limit: 2, period: 60 } },
      },
    }),
  );
  try {
    // Five calls span at most two windows of two, so one has to be refused
    // even when a window boundary falls in the middle of the run.
    const results = [];
    for (let call = 0; call < 5; call++) {
      results.push(await callTool("list_pages", undefined, limited));
    }
    const refused = results.find((result) => result.isError);
    assert.match(refused?.text ?? "", /Rate limit/);
  } finally {
    await limited.dispose();
  }
});

test("update_page keeps the link, creation time and deletion key; get_page returns the source", async () => {
  const { id, url, deletionKey } = await publish("<h1>v1</h1>", "Draft");
  const original = pageSchema.parse(
    JSON.parse((await callTool("get_page", { id })).text),
  );
  assert.equal(original.createdAt, original.updatedAt);
  await delay(5);

  const updated = await callTool("update_page", { id, html: "<h1>v2 é</h1>" });
  assert.ok(!updated.isError, updated.text);
  assert.equal(updated.text.split("\n")[1], url);
  assert.equal(await (await mf.dispatchFetch(url)).text(), "<h1>v2 é</h1>");

  await callTool("update_page", { id, html: "<h1>v3</h1>", title: "Final" });
  const read = await callTool("get_page", { id });
  const record = pageSchema.parse(JSON.parse(read.text));
  assert.equal(record.title, "Final");
  assert.equal(record.createdAt, original.createdAt);
  assert.ok(record.updatedAt > original.updatedAt);
  assert.equal(read.blocks[1], "<h1>v3</h1>");

  const missing = "f".repeat(32);
  assert.ok((await callTool("update_page", { id: missing, html: "<p>x</p>" })).isError);
  assert.ok((await callTool("get_page", { id: missing })).isError);
  assert.ok(!(await callTool("delete_page", { id, deletionKey })).isError);
});

test("update_page moves a legacy page to the current key and keeps its link", async () => {
  const bucket = await mf.getR2Bucket("PAGES");
  const id = "0a1b2c3d4e5f";
  const oldKey = `pages/${id}~${Buffer.from("Legacy plan").toString("base64url")}.html`;
  await bucket.put(oldKey, "<p>old</p>");
  const updated = await callTool("update_page", { id, html: "<p>new</p>" });
  assert.ok(!updated.isError, updated.text);
  assert.equal(await bucket.head(oldKey), null);
  assert.equal(await (await mf.dispatchFetch(`${base}/p/${id}`)).text(), "<p>new</p>");
  const record = pageSchema.parse(JSON.parse((await callTool("get_page", { id })).text));
  assert.equal(record.title, "Legacy plan");
  await bucket.delete(`pages/${id}.html`);
});

async function grant() {
  const { text } = await callTool("create_upload_url", { contentType: "image/png" });
  const uploadUrl = /curl -T <file> "([^"]+)"/.exec(text)?.[1];
  const assetUrl = /Then embed: (\S+)/.exec(text)?.[1];
  assert.ok(uploadUrl && assetUrl);
  return { uploadUrl, assetUrl };
}
// The PNG signature and a few bytes of body.
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
// curl sends a Content-Length; dispatchFetch would send the body chunked.
const put = (url: string, body = png) =>
  mf.dispatchFetch(url, {
    method: "PUT",
    body,
    headers: { "content-length": String(body.byteLength) },
  });
const status = async (url: string) => {
  const response = await mf.dispatchFetch(url);
  await response.body?.cancel();
  return response.status;
};

test("an image uploads once, is served safely and outlives its last page by a day", async () => {
  const first = await grant();
  assert.equal((await put(first.uploadUrl.replace("expires=", "expires=1"))).status, 403);
  const name = new URL(first.uploadUrl).pathname.split("/").at(-1);
  const signature = createHmac("sha256", key)
    .update(`pagepilot-upload-v1\n${name}\n1`)
    .digest("base64url");
  const expired = await put(
    `${base}/api/assets/${name}?expires=1&signature=${signature}`,
  );
  assert.equal(expired.status, 403);
  assert.match(await expired.text(), /expired/);
  assert.equal((await put(first.uploadUrl, new Uint8Array(10_000_001))).status, 413);
  assert.equal((await mf.dispatchFetch(first.uploadUrl, { method: "POST" })).status, 405);
  assert.equal(await status(first.assetUrl), 404);
  // A file that is not an image is refused and does not use the URL up.
  const html = new TextEncoder().encode("<script>alert(1)</script>");
  assert.equal((await put(first.uploadUrl, html)).status, 415);

  assert.equal((await put(first.uploadUrl)).status, 201);
  assert.equal((await put(first.uploadUrl)).status, 409);
  const served = await mf.dispatchFetch(first.assetUrl);
  assert.equal(served.status, 200);
  assert.deepEqual(new Uint8Array(await served.arrayBuffer()), png);
  assert.equal(served.headers.get("content-type"), "image/png");
  assert.equal(served.headers.get("x-content-type-options"), "nosniff");
  assert.match(served.headers.get("content-security-policy") ?? "", /sandbox/);

  // Two pages embed the first image, one of them with escaped slashes, so it
  // has to outlive either one alone.
  const report = await publish(`<img src="${first.assetUrl}">`, "Report");
  const copy = await publish(
    `<script>const shot = "${first.assetUrl.replaceAll("/", "\\/")}"</script>`,
    "Report copy",
  );
  const second = await grant();
  assert.equal((await put(second.uploadUrl)).status, 201);
  await callTool("update_page", {
    id: report.id,
    html: `<img src="${second.assetUrl}">`,
  });
  await sweepImages();
  assert.equal(await status(first.assetUrl), 200, "still embedded by the copy");

  // Nobody embeds the first image now, but a page published within the day
  // picks it up again.
  await callTool("delete_page", { id: copy.id, deletionKey: copy.deletionKey });
  assert.equal(await status(first.assetUrl), 200, "kept for a day");
  const revived = await publish(`<img src="${first.assetUrl}">`, "Revived");
  await sweepImages();
  assert.equal(await status(first.assetUrl), 200, "embedded again");

  await callTool("delete_page", { id: revived.id, deletionKey: revived.deletionKey });
  await callTool("delete_page", { id: report.id, deletionKey: report.deletionKey });
  const unused = await grant();
  assert.equal((await put(unused.uploadUrl)).status, 201);
  await sweepImages();
  assert.equal(await status(first.assetUrl), 404, "deleted after its last page");
  assert.equal(await status(second.assetUrl), 404, "deleted after its page");
  assert.equal(await status(unused.assetUrl), 404, "never embedded");

  // Publishing a page that links a deleted image says so.
  const broken = await callTool("deploy_page", { html: `<img src="${first.assetUrl}">` });
  assert.ok(broken.text.endsWith(`will not show: ${first.assetUrl.split("/").at(-1)}`));
  await callTool("delete_page", {
    id: /\/p\/([a-f0-9]{32})/.exec(broken.text)?.[1] ?? "",
    deletionKey: deletionKey(broken) ?? "",
  });
});

test("update_page keeps the version it replaced, images included, until the next change", async () => {
  const shot = await grant();
  assert.equal((await put(shot.uploadUrl)).status, 201);
  // The leading BOM has to come back, and must not make a resend look new.
  const v1 = `\uFEFF<h1>v1</h1><img src="${shot.assetUrl}">`;
  const v2 = "\uFEFF<h1>v2</h1>";
  const { id, deletionKey } = await publish(v1, "Kept");
  assert.ok((await callTool("get_page", { id, previous: true })).isError);

  await callTool("update_page", { id, html: v2, title: "Kept, renamed" });
  const previous = await callTool("get_page", { id, previous: true });
  assert.equal(previous.blocks[1], v1);
  assert.equal(
    z.object({ title: z.string() }).parse(JSON.parse(previous.text)).title,
    "Kept",
  );
  await sweepImages();
  assert.equal(await status(shot.assetUrl), 200, "the kept version still embeds it");

  // Sending the same HTML again changes nothing worth keeping.
  await callTool("update_page", { id, html: v2 });
  assert.equal((await callTool("get_page", { id })).blocks[1], v2);
  assert.equal((await callTool("get_page", { id, previous: true })).blocks[1], v1);

  // A copy left over from some other version is not handed out as this one's.
  const bucket = await mf.getR2Bucket("PAGES");
  await bucket.put(`previous/${id}.html`, "<h1>stale</h1>", {
    customMetadata: { replacedBy: "0".repeat(32) },
  });
  assert.ok((await callTool("get_page", { id, previous: true })).isError);

  await callTool("update_page", { id, html: "<h1>v3</h1>" });
  assert.equal((await callTool("get_page", { id, previous: true })).blocks[1], v2);
  await sweepImages();
  assert.equal(await status(shot.assetUrl), 404, "neither version embeds it");

  await callTool("delete_page", { id, deletionKey });
  assert.equal(await bucket.head(`previous/${id}.html`), null);
});

test("a failing ledger refuses pages with images and nothing else", async () => {
  // LEDGER points at a class with no methods, so every ledger call rejects.
  const failing = new Miniflare(
    convertV4MiniflareOptions({
      workers: [
        {
          ...worker,
          name: "pagepilot",
          bindings: { PAGEPILOT_API_KEY: key },
          durableObjects: { LEDGER: { className: "Ledger", scriptName: "broken" } },
        },
        {
          name: "broken",
          modules: true,
          compatibilityDate: "2026-09-16",
          durableObjects: { LEDGER: "Ledger" },
          script:
            'import { DurableObject } from "cloudflare:workers"; export class Ledger extends DurableObject {} export default { fetch: () => new Response(null) };',
        },
      ],
    }),
  );
  try {
    // Published unrecorded, the image could be deleted from under the page.
    const image = `<img src="${base}/a/${"a".repeat(32)}.png">`;
    assert.ok((await callTool("deploy_page", { html: image }, failing)).isError);
    const bucket = await failing.getR2Bucket("PAGES");
    assert.equal((await bucket.list()).objects.length, 0);

    const { id, url, deletionKey } = await publish("<p>plain</p>", "Plain", failing);
    assert.ok((await callTool("update_page", { id, html: image }, failing)).isError);
    assert.equal(await (await failing.dispatchFetch(url)).text(), "<p>plain</p>");
    const edited = await callTool("update_page", { id, html: "<p>edited</p>" }, failing);
    assert.ok(!edited.isError, edited.text);
    assert.ok(!(await callTool("list_pages", undefined, failing)).isError);
    const deleted = await callTool("delete_page", { id, deletionKey }, failing);
    assert.ok(!deleted.isError, deleted.text);
  } finally {
    await failing.dispose();
  }
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
      ...worker,
      bindings: { PAGEPILOT_API_KEY: key, PUBLIC_URL: "https://pagepilot.rafay99.com" },
    }),
  );
  try {
    const result = await callTool(
      "deploy_page",
      { html: "<p>local test</p>" },
      production,
    );
    assert.ok(!result.isError);
    const link = /https:\/\/pagepilot\.rafay99\.com(\/p\/[a-f0-9]{32})/.exec(result.text);
    assert.ok(link?.[1]);
    // This instance has no ledger and no limiter. Pages still serve and list.
    const served = await production.dispatchFetch(`${base}${link[1]}`);
    assert.equal(served.status, 200);
    await served.body?.cancel();
    assert.ok(!(await callTool("list_pages", undefined, production)).isError);
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
    ...worker,
    bindings: {
      PAGEPILOT_API_KEY: key,
      ACCESS_TEAM_DOMAIN: accessDomain,
      ACCESS_AUD: accessAud,
      OWNER_EMAIL: ownerEmail,
    },
    ...stateful,
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
      ...worker,
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
  const { id } = await publish("<p>dash</p>", "Dash", accessMf);
  await bucket.put(
    `pages/012345abcdef~${Buffer.from("Old").toString("base64url")}.html`,
    "<p>old</p>",
  );

  const listing = dashboardListingSchema.parse(
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

test("views count real reads only and show in the owner's list", async () => {
  const startDay = new Date().toISOString().slice(0, 10);
  const { id, url } = await publish("<p>views</p>", "Viewed", accessMf);
  const read = async (init?: { method?: string; headers?: Record<string, string> }) => {
    const response = await accessMf.dispatchFetch(url, init);
    await response.body?.cancel();
  };
  await read();
  await read();
  await read({ method: "HEAD" });
  await read({ headers: { "user-agent": "Slackbot-LinkExpanding 1.0" } });
  await (await dashboard(`/api/dashboard/pages/${id}/preview`)).body?.cancel();

  const listed = async () =>
    dashboardListingSchema
      .parse(await (await dashboard("/api/dashboard/pages")).json())
      .items.find((page) => page.id === id);
  // Counts are written after the response is sent, so wait for both to land
  // and then a little longer in case a third, wrong one is still on its way.
  for (let attempt = 0; attempt < 40 && (await listed())?.views !== 2; attempt++) {
    await delay(25);
  }
  await delay(50);
  const page = await listed();
  assert.equal(page?.views, 2);
  // Either day is right when the run crosses midnight UTC.
  assert.ok(
    [startDay, new Date().toISOString().slice(0, 10)].includes(page?.lastViewed ?? ""),
  );

  const deleted = await dashboard(`/api/dashboard/pages/${id}`, {
    method: "DELETE",
    headers: { origin: base },
  });
  assert.equal(deleted.status, 200);
  const bucket = await accessMf.getR2Bucket("PAGES");
  await bucket.put(`pages/${id}.html`, "<p>again</p>");
  assert.equal((await listed())?.views, 0, "counts are deleted with the page");
  await bucket.delete(`pages/${id}.html`);
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
  assetCount: count,
  assetBytes: count,
  complete: z.boolean(),
  months: z.array(
    z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), bytes: count, pages: count }),
  ),
  largest: z.array(pageSchema).max(10),
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
  await bucket.put(`assets/${"c".repeat(32)}.png`, "x".repeat(11));

  const response = await dashboard("/api/dashboard/storage");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const report = storageSchema.parse(await response.json());
  assert.equal(report.usedBytes, 468);
  assert.equal(report.objectCount, 4);
  assert.equal(report.pageCount, 2);
  assert.equal(report.assetCount, 1);
  assert.equal(report.assetBytes, 11);
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
