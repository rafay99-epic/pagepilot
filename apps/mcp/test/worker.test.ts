/**
 * In-process conformance for the Worker face: the bearer gate and one full
 * 2025-era protocol exchange through worker.fetch. No R2 calls, no wrangler.
 * Run with: bun --env-file=../../.env.local test
 */
import { expect, test } from "bun:test";
import worker from "../src/worker";

const MCP_URL = "http://test.local/";

function rpc(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return worker.fetch(
    new Request(MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}

/** The legacy leg may answer JSON or SSE; both carry the same JSON-RPC result. */
async function resultOf(res: Response): Promise<Record<string, unknown>> {
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("text/event-stream")) {
    const raw = await res.text();
    const data = raw
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .at(-1);
    expect(data).toBeDefined();
    return JSON.parse(data!);
  }
  return res.json();
}

test("requests without the bearer key get the JSON-RPC 401", async () => {
  const res = await rpc({ jsonrpc: "2.0", id: 1, method: "ping" });
  expect(res.status).toBe(401);
  const json = (await res.json()) as { error: { code: number } };
  expect(json.error.code).toBe(-32001);
});

test("the worker serves the three tools over the 2025-era flow", async () => {
  const key = process.env.PAGEPILOT_API_KEY;
  if (!key) return; // credentials are needed only for the authorized leg

  const init = await rpc(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "conformance", version: "0.0.0" },
      },
    },
    { authorization: `Bearer ${key}` },
  );
  expect(init.status).toBe(200);

  const list = await rpc(
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    { authorization: `Bearer ${key}` },
  );
  expect(list.status).toBe(200);
  const json = await resultOf(list);
  const result = json.result as { tools: { name: string }[] };
  expect(result.tools.map((t) => t.name).sort()).toEqual([
    "delete_page",
    "deploy_page",
    "list_pages",
  ]);
});
