import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { AppRouter } from "@pagepilot/core/routers/_app";

const DEFAULT_URL = "https://pagepilot.rafay99.com";
const KEY_FILE = join(homedir(), ".pagepilot");

/**
 * Read the key from ~/.pagepilot so it isn't pasted into every harness's MCP
 * config. An env var still wins, for local dev against a different instance.
 */
function readKey(): string {
  if (process.env.PAGEPILOT_API_KEY) return process.env.PAGEPILOT_API_KEY;
  try {
    return readFileSync(KEY_FILE, "utf8").trim();
  } catch {
    return "";
  }
}

const API_URL = (process.env.PAGEPILOT_URL || DEFAULT_URL).replace(/\/+$/, "");
const API_KEY = readKey();

if (!API_KEY) {
  console.error(
    `No API key. Write it to ${KEY_FILE} (chmod 600) or set PAGEPILOT_API_KEY.`,
  );
}

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/api/trpc`,
      headers: { authorization: `Bearer ${API_KEY}` },
    }),
  ],
});

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

const server = new McpServer({ name: "pagepilot", version: "0.1.0" });

server.registerTool(
  "deploy_page",
  {
    description:
      "Upload an HTML page to the user's private PagePilot vault. Private by default: " +
      "the returned URL only opens in a browser the user has unlocked. Pass share=true " +
      "only when the user asks for a link they can send to someone else.",
    inputSchema: {
      html: z.string().min(1).describe("The full HTML content of the page"),
      title: z.string().optional().describe("A label for the page, shown in the list"),
      share: z
        .boolean()
        .optional()
        .describe("Make the page readable by anyone holding the link. Default false."),
    },
  },
  async ({ html, title, share }) => {
    const r = await trpc.slop.deploy.mutate({ html, title, share: share ?? false });
    return text(
      `Deployed "${r.title}" (${r.shared ? "public link" : "private"})\n` +
        `URL: ${r.url}\nID:  ${r.id}`,
    );
  },
);

server.registerTool(
  "list_pages",
  {
    description:
      "List pages in the vault, newest first, with titles, IDs, URLs, whether each is " +
      "publicly shared, and creation dates",
    inputSchema: {
      limit: z.number().min(1).max(100).optional().describe("How many to return"),
    },
  },
  async ({ limit }) => {
    const r = await trpc.slop.list.query({ limit: limit ?? 100 });
    if (r.items.length === 0) return text("No pages in the vault yet.");
    return text(
      r.items
        .map(
          (p, i) =>
            `${i + 1}. ${p.title} [${p.shared ? "public" : "private"}]\n` +
            `   ${p.url}\n   ID: ${p.id} — ${p.createdAt}`,
        )
        .join("\n"),
    );
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
  async ({ id }) => {
    const r = await trpc.slop.setShared.mutate({ id, shared: true });
    return text(`"${r.title}" is now public.\nURL: ${r.url}\nID:  ${r.id}`);
  },
);

server.registerTool(
  "unshare_page",
  {
    description:
      "Revoke a page's public link. Anyone holding the old URL immediately loses " +
      "access; the page itself is kept and gets a new private ID.",
    inputSchema: { id: z.string().min(1).describe("The ID of the page to unshare") },
  },
  async ({ id }) => {
    const r = await trpc.slop.setShared.mutate({ id, shared: false });
    return text(`"${r.title}" is private again. The old link no longer works.`);
  },
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
    await trpc.slop.delete.mutate({ id });
    return text(`Deleted page ${id}.`);
  },
);

await server.connect(new StdioServerTransport());
console.error(`pagepilot MCP server on stdio -> ${API_URL}`);
