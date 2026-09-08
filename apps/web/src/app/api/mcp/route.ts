import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { deployPage, listPages, deletePage } from "@pagepilot/core/r2";
import { isAuthed, unauthorized } from "@pagepilot/core/auth";

/**
 * The longest thing a tool does is PUT 900 KB to R2. A minute was headroom
 * nothing here needs, and it let a request that stalls hold a function open for
 * that whole minute.
 */
export const maxDuration = 15;

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

/**
 * Module scope, not per request: an MCP session is an initialize, a tools/list
 * and then the calls, and rebuilding these zod schemas for each of them was
 * cold-start work charged over and over on a warm instance.
 */
const DEPLOY_PAGE = {
  description:
    "Publish an HTML page to the user's PagePilot vault and get a short URL back. " +
    "Anyone holding the URL can read the page, so hand it to the user rather than " +
    "posting it anywhere public.",
  inputSchema: {
    html: z.string().min(1).describe("The full HTML content of the page"),
    title: z.string().optional().describe("A label for the page, shown in the list"),
  },
} as const;

// No inputSchema at all: a tool whose every argument is optional gets rejected
// by the SDK when a client omits `arguments` entirely, which is legal and which
// clients do. Taking no arguments sidesteps that.
const LIST_PAGES = {
  description:
    "List up to 100 pages in the vault with titles, IDs, URLs and creation dates",
} as const;

const DELETE_PAGE = {
  description:
    "Permanently remove a page from the vault. The URL stops working within two minutes.",
  inputSchema: {
    id: z.string().min(1).describe("The page ID, e.g. 'debe892c1fc3'"),
  },
} as const;

function buildServer() {
  const server = new McpServer({ name: "pagepilot", version: "2.0.0" });

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

async function handle(request: Request): Promise<Response> {
  // The middleware already rejected this, so reaching it means the middleware
  // was bypassed. Kept because the key is the only thing guarding the vault.
  if (!isAuthed(request)) return unauthorized();

  // A fresh server and transport per request: this runs on serverless, so there
  // is no process to keep a session in. Stateless mode plus JSON responses means
  // no SSE stream left hanging when the function is frozen.
  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

export { handle as GET, handle as POST, handle as DELETE };
