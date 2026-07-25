import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  deployPage,
  listPages,
  deletePage,
  setShared,
  type PageRecord,
} from "@pagepilot/core/r2";
import { isAuthed } from "@pagepilot/core/auth";

export const maxDuration = 60;

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

const describe = (p: PageRecord & { url: string }) =>
  `"${p.title}" — ${p.shared ? "public link" : "private"}\nURL: ${p.url}\nID:  ${p.id}`;

function buildServer() {
  const server = new McpServer({ name: "pagepilot", version: "1.0.0" });

  server.registerTool(
    "deploy_page",
    {
      description:
        "Publish an HTML page to the user's private PagePilot vault and get a URL back. " +
        "Private by default — the URL only opens in a browser the user has unlocked. " +
        "Pass share=true only when the user wants a link they can send to someone else.",
      inputSchema: {
        html: z.string().min(1).describe("The full HTML content of the page"),
        title: z.string().optional().describe("A label for the page, shown in the list"),
        share: z
          .boolean()
          .optional()
          .describe("Make the page readable by anyone holding the link. Default false."),
      },
    },
    async ({ html, title, share }) =>
      text(`Deployed.\n${describe(await deployPage(html, title, share ?? false))}`),
  );

  // No inputSchema at all: a tool whose every argument is optional gets rejected
  // by the SDK when a client omits `arguments` entirely, which is legal and which
  // clients do. Taking no arguments sidesteps that.
  // ponytail: returns the 200 newest and says so rather than paginating.
  server.registerTool(
    "list_pages",
    {
      description:
        "List the pages in the vault, newest first, with titles, IDs, URLs, whether each " +
        "is publicly shared, and creation dates",
    },
    async () => {
      const { items, nextCursor } = await listPages(200);
      if (items.length === 0) return text("The vault is empty.");
      const body = items.map((p, i) => `${i + 1}. ${describe(p)}`).join("\n\n");
      return text(nextCursor ? `${body}\n\n(showing the 200 newest)` : body);
    },
  );

  server.registerTool(
    "share_page",
    {
      description:
        "Turn a private page into a public link anyone can open. The page gets a new ID " +
        "and URL, so use the URL this returns.",
      inputSchema: { id: z.string().min(1).describe("The ID of the page to share") },
    },
    async ({ id }) => text(`Now public.\n${describe(await setShared(id, true))}`),
  );

  server.registerTool(
    "unshare_page",
    {
      description:
        "Revoke a page's public link. Anyone holding the old URL immediately loses " +
        "access; the page is kept and gets a new private ID.",
      inputSchema: { id: z.string().min(1).describe("The ID of the page to unshare") },
    },
    async ({ id }) =>
      text(
        `Private again, the old link no longer works.\n${describe(
          await setShared(id, false),
        )}`,
      ),
  );

  server.registerTool(
    "delete_page",
    {
      description: "Permanently remove a page from the vault",
      inputSchema: {
        id: z
          .string()
          .min(1)
          .describe("The full ID as returned by list_pages or deploy_page"),
      },
    },
    async ({ id }) => {
      await deletePage(id);
      return text(`Deleted ${id}.`);
    },
  );

  return server;
}

async function handle(request: Request): Promise<Response> {
  if (!isAuthed(request)) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Unauthorized: send Authorization: Bearer <key>",
        },
        id: null,
      },
      { status: 401, headers: { "www-authenticate": "Bearer" } },
    );
  }

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
