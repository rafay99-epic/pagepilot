/**
 * Protocol conformance for the shared MCP handler, no storage touched:
 * the 2025-era handshake flow every existing client still speaks, and the
 * 2026-07-28 envelope path with its cacheable tools/list. Run with
 *   bun --env-file=../../.env.local test
 */
import { expect, test } from "bun:test";
import { mcpHandler } from "./mcp";

const MCP_URL = "http://test.local/mcp";

async function rpc(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return mcpHandler.fetch(
    new Request(MCP_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Streamable HTTP refuses POSTs that don't accept both media types.
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

test("2025-era clients keep the initialize handshake", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "conformance", version: "0.0.0" },
    },
  });
  expect(res.status).toBe(200);
  const json = await resultOf(res);
  const result = json.result as Record<string, unknown>;
  const serverInfo = result.serverInfo as Record<string, unknown>;
  expect(serverInfo.name).toBe("pagepilot");
});

test("2025-era tools/list serves the three tools", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  expect(res.status).toBe(200);
  const json = await resultOf(res);
  const tools = (json.result as Record<string, unknown>).tools as { name: string }[];
  expect(tools.map((t) => t.name).sort()).toEqual(["delete_page", "deploy_page", "list_pages"]);
});

test("2026-07-28 tools/list carries the advertised cache hints", async () => {
  const res = await rpc(
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: {
        _meta: {
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    },
    { "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": "tools/list" },
  );
  expect(res.status).toBe(200);
  const json = await resultOf(res);
  const result = json.result as Record<string, unknown>;
  expect(result.ttlMs).toBe(24 * 60 * 60 * 1000);
  expect(result.cacheScope).toBe("private");
  const tools = result.tools as { name: string }[];
  expect(tools).toHaveLength(3);
});
