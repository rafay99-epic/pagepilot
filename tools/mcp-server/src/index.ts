import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { AppRouter } from "@pagepilot/core/routers/_app";

const API_URL = process.env.PAGEPILOT_URL || "http://localhost:3000";
const API_KEY = process.env.PAGEPILOT_API_KEY;

if (!API_KEY) {
  console.error("PAGEPILOT_API_KEY is not set — every call will be rejected.");
}

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/api/trpc`,
      headers: { authorization: `Bearer ${API_KEY ?? ""}` },
    }),
  ],
});

const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

const server = new McpServer({ name: "pagepilot", version: "0.1.0" });

server.registerTool(
  "deploy_page",
  {
    description:
      "Upload an HTML page to PagePilot and get back a URL you can share with anyone",
    inputSchema: {
      html: z.string().min(1).describe("The full HTML content of the page"),
      title: z.string().optional().describe("A label for the page, shown in the list"),
    },
  },
  async ({ html, title }) => {
    const r = await trpc.slop.deploy.mutate({ html, title });
    return text(`Deployed "${r.title}"\nURL: ${r.url}\nID:  ${r.id}`);
  },
);

server.registerTool(
  "list_pages",
  {
    description:
      "List deployed HTML pages, newest first, with titles, IDs, URLs and creation dates",
    inputSchema: {
      limit: z.number().min(1).max(100).optional().describe("How many to return"),
    },
  },
  async ({ limit }) => {
    const r = await trpc.slop.list.query({ limit: limit ?? 100 });
    if (r.items.length === 0) return text("No pages deployed yet.");
    return text(
      r.items
        .map(
          (p, i) => `${i + 1}. ${p.title}\n   ${p.url}\n   ID: ${p.id} — ${p.createdAt}`,
        )
        .join("\n"),
    );
  },
);

server.registerTool(
  "delete_page",
  {
    description: "Permanently remove a deployed HTML page",
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
