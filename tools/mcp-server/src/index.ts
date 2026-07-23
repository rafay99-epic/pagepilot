import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types";
import type { AppRouter } from "@pagepilot/core/routers/_app";

const API_URL = process.env.PAGEPILOT_URL || "http://localhost:3000";
const API_KEY = process.env.PAGEPILOT_API_KEY || "";

const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${API_URL}/api/trpc`,
      headers: { authorization: `Bearer ${API_KEY}` },
    }),
  ],
});

const server = new Server(
  { name: "pagepilot", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "deploy_page",
      description:
        "Upload an HTML page to PagePilot and get a clickable URL you can share with anyone",
      inputSchema: {
        type: "object",
        properties: {
          html: {
            type: "string",
            description: "The full HTML content of the page",
          },
          title: {
            type: "string",
            description: "A label for the page (defaults to auto-generated name)",
          },
        },
        required: ["html"],
      },
    },
    {
      name: "list_pages",
      description:
        "List all deployed HTML pages with their titles, IDs, URLs, and creation dates",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "delete_page",
      description: "Permanently remove a deployed HTML page by its ID",
      inputSchema: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "The ID of the page to delete (e.g. 'a1b2c3d4')",
          },
        },
        required: ["id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "deploy_page": {
      const { html, title } = args as { html: string; title?: string };
      if (!html || typeof html !== "string") {
        throw new Error("html is required and must be a string");
      }
      const result = await trpc.slop.deploy.mutate({ html, title });
      return {
        content: [
          {
            type: "text",
            text:
              `✅ Page deployed successfully\n\n` +
              `Title: ${result.title}\n` +
              `URL:   ${result.url}\n` +
              `ID:    ${result.id}\n` +
              `Created: ${result.createdAt}`,
          },
        ],
      };
    }

    case "list_pages": {
      const result = await trpc.slop.list.query({ limit: 100 });
      if (result.items.length === 0) {
        return {
          content: [{ type: "text", text: "No pages deployed yet." }],
        };
      }
      const lines = result.items.map(
        (p, i) =>
          `${i + 1}. ${p.title}\n   ID: ${p.id}\n   URL: ${p.url}\n   Created: ${p.createdAt}`,
      );
      return {
        content: [
          {
            type: "text",
            text: `📄 ${result.items.length} page(s) deployed\n\n${lines.join("\n\n")}`,
          },
        ],
      };
    }

    case "delete_page": {
      const { id } = args as { id: string };
      await trpc.slop.delete.mutate({ id });
      return { content: [{ type: "text", text: `Deleted page ${id}.` }] };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("pagepilot MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
