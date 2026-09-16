import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";

const key = "local-test-key-not-a-production-secret";
const base = "https://pagepilot.test";
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    scriptPath: "dist/index.js",
    compatibilityDate: "2026-09-16",
    compatibilityFlags: ["nodejs_compat"],
    r2Buckets: ["PAGES"],
    bindings: { PAGEPILOT_API_KEY: key },
  }),
);

before(async () => {
  await mf.ready;
});
after(async () => {
  await mf.dispose();
});

async function rpc(method: string, params?: unknown) {
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

async function callTool(name: string, args?: unknown) {
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
  return { id, url };
}

test("backend starts; API key protects all MCP methods and origins", async () => {
  assert.equal(await (await mf.dispatchFetch(`${base}/health`)).text(), "ok");
  assert.equal((await mf.dispatchFetch(`${base}/`)).status, 404);
  assert.equal((await mf.dispatchFetch(`${base}/dashboard`)).status, 404);
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
      modules: true,
      scriptPath: "dist/index.js",
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
  const transport = new StreamableHTTPClientTransport(
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
  const { id, url } = await publish(html, "Unicode café");
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
  assert.ok(!(await callTool("delete_page", { id })).isError);
  assert.equal((await mf.dispatchFetch(url)).status, 404);
  assert.equal(await bucket.head(`pages/${id}.html`), null);
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
  assert.ok(!(await callTool("delete_page", { id })).isError);
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
  const { id } = await publish("é".repeat(450_000));
  await callTool("delete_page", { id });
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
      modules: true,
      scriptPath: "dist/index.js",
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
