# PagePilot

> A private HTML vault for AI agents. Deploy HTML pages via MCP, stored in Cloudflare R2, served on Vercel.

```
AI Agent → MCP Server (stdio) → tRPC → Next.js API handler → S3 SDK → Cloudflare R2
                                                        ￨
                                                Dashboard UI (React + tRPC)
```

Everything is end-to-end type safe via tRPC. Same API surface serves both the MCP agent and the dashboard.

## Setup

### 1. Deploy to Vercel

Link your repo, add these environment variables to the `apps/web` project:

| Variable | Description |
|----------|-------------|
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET` | Bucket name (default: `pagepilot`) |
| `PAGEPILOT_API_KEY` | Secret key for the deploy endpoint |
| `PUBLIC_URL` | Your Vercel URL (e.g. `https://pagepilot.vercel.app`) |

### 2. Run locally

```bash
bun install
bun run dev          # starts web on :3000
```

Copy `.env.example` to `.env.local` and fill in your R2 credentials.

### 3. Configure your MCP client

```json
{
  "mcpServers": {
    "pagepilot": {
      "command": "bun",
      "args": ["run", "--cwd", "/path/to/pagepilot/tools/mcp-server", "src/index.ts"],
      "env": {
        "PAGEPILOT_URL": "https://your-app.vercel.app",
        "PAGEPILOT_API_KEY": "your-api-key"
      }
    }
  }
}
```

## MCP Tools

- `deploy_page(html, title?)` — Deploy HTML, returns `{ id, title, url, createdAt }`
- `list_pages()` — List all deployed pages
- `delete_page(id)` — Delete a page by ID
