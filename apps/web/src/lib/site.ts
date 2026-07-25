/** Single source of truth for anything that needs the deployment's own origin. */
export const siteUrl = (
  process.env.PUBLIC_URL?.startsWith("https://")
    ? process.env.PUBLIC_URL
    : process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : (process.env.PUBLIC_URL ?? "http://localhost:3000")
).replace(/\/+$/, "");

export const site = {
  name: "PagePilot",
  tagline: "Your AI agent builds it. PagePilot deploys it.",
  description:
    "A private HTML vault for AI agents. One hosted MCP endpoint, your own Cloudflare R2 bucket — publish a page from Claude, Cursor or any MCP client and get a short, unguessable URL back.",
  url: siteUrl,
  mcpUrl: `${siteUrl}/api/mcp`,
  repo: "https://github.com/rafay99-epic/pagepilot",
} as const;
