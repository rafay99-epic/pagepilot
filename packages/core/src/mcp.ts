/**
 * The MCP surface shared by the Vercel route and the Cloudflare Worker: one
 * factory, three tools, both protocol eras. `createMcpHandler` builds a fresh
 * instance per request and serves 2026-07-28 natively while its default
 * `legacy: 'stateless'` posture keeps every existing 2025-era client working
 * through the same endpoint.
 */
import { createMcpHandler, McpServer, preloadSchemas } from "@modelcontextprotocol/server";
import { z } from "zod";
import { deployPage, listPages, deletePage } from "./r2";

/**
 * The SDK parses wire messages against zod schemas, lazily. On isolate-based
 * runtimes that bill active CPU, deferring that work moves it into the first
 * request of every fresh isolate, so warm the memos at module scope instead.
 */
preloadSchemas();

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

const DEPLOY_PAGE = {
  description:
    "Publish an HTML page to the user's PagePilot vault and get a short URL back. " +
    "Anyone holding the URL can read the page, so hand it to the user rather than " +
    "posting it anywhere public.",
  inputSchema: z.object({
    html: z.string().min(1).describe("The full HTML content of the page"),
    title: z.string().optional().describe("A label for the page, shown in the list"),
  }),
};

// No inputSchema at all: a tool whose every argument is optional gets rejected
// by the SDK when a client omits `arguments` entirely, which is legal and which
// clients do. Taking no arguments sidesteps that.
const LIST_PAGES = {
  description:
    "List up to 100 pages in the vault with titles, IDs, URLs and creation dates",
};

const DELETE_PAGE = {
  description:
    "Permanently remove a page from the vault. The URL stops working within two minutes.",
  inputSchema: z.object({
    id: z.string().min(1).describe("The page ID, e.g. 'debe892c1fc3'"),
  }),
};

/**
 * The tool catalog is three tools that never change shape, so clients may hold
 * `tools/list` for a day instead of refetching it per session or reconnect.
 */
const TOOL_LIST_TTL_MS = 24 * 60 * 60 * 1000;

export function buildServer() {
  const server = new McpServer(
    { name: "pagepilot", version: "2.0.0" },
    {
      capabilities: { tools: {} },
      cacheHints: { "tools/list": { ttlMs: TOOL_LIST_TTL_MS, cacheScope: "private" } },
    },
  );

  server.registerTool("deploy_page", DEPLOY_PAGE, async ({ html, title }) => {
    const p = await deployPage(html, title);
    return text(`Published "${p.title}"\n${p.url}`);
  });

  server.registerTool("list_pages", LIST_PAGES, async () => {
    const { items, nextCursor } = await listPages(100);
    if (items.length === 0) return text("The vault is empty.");
    const body = items
      .map((p, i) => `${i + 1}. ${p.title}\n   ${p.url}\n   ${p.id} — ${p.createdAt}`)
      .join("\n");
    return text(nextCursor ? `${body}\n\n(showing the first 100)` : body);
  });

  server.registerTool("delete_page", DELETE_PAGE, async ({ id }) =>
    text((await deletePage(id)) ? `Deleted ${id}.` : `No page with id ${id}.`),
  );

  return server;
}

export const mcpHandler = createMcpHandler(buildServer);
