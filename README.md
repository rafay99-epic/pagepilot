# PagePilot

> A private HTML vault for AI agents. Deploy HTML pages via MCP, stored in Cloudflare R2, served on Vercel.

```
AI Agent → MCP Server (stdio) → tRPC → Next.js API handler → S3 SDK → Cloudflare R2
                                                        ￨
                                                Dashboard UI (React + tRPC)
```

Everything is end-to-end type safe via tRPC. Same API surface serves both the MCP agent and the dashboard.

Run your own copy — your bucket, your Vercel project, your key. Nobody hosts your pages
but you.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/rafay99-epic/pagepilot&root-directory=apps/web&env=R2_ACCOUNT_ID,R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY,R2_BUCKET,PAGEPILOT_API_KEY)

## Setup

### 1. Deploy to Vercel

Import the repo and set **Root Directory** to `apps/web`. Leave the build command on
the default `next build` — Vercel installs the bun workspace from the repo root, so
`packages/core` is symlinked in. Then add these environment variables:

| Variable               | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `R2_ACCOUNT_ID`        | Cloudflare R2 account ID                                          |
| `R2_ACCESS_KEY_ID`     | R2 API token access key                                           |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret                                               |
| `R2_BUCKET`            | Bucket name (default: `pagepilot`)                                |
| `PAGEPILOT_API_KEY`    | Secret key guarding deploy, list and delete                       |
| `PUBLIC_URL`           | Optional — only for a custom domain. Defaults to your Vercel URL. |

### 2. Run locally

```bash
bun install
bun run dev          # starts web on :3000
bun run test         # round-trips one page through your real bucket
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
- `list_pages(limit?)` — List pages, newest first
- `delete_page(id)` — Delete a page by its full ID

## Without MCP

Any harness that can run `curl` can deploy — it's the same tRPC endpoint:

```bash
curl -X POST "$PAGEPILOT_URL/api/trpc/slop.deploy" \
  -H "authorization: Bearer $PAGEPILOT_API_KEY" \
  -H "content-type: application/json" \
  -d '{"html":"<h1>hi</h1>","title":"My plan"}'
```

## Access model

`deploy`, `list` and `delete` all require `PAGEPILOT_API_KEY`. The dashboard prompts for
it once and keeps it in that browser's local storage. `/view/<id>` is public so the links
you hand out work for anyone — ids carry 48 bits of randomness, so they aren't guessable.

## Storage layout

One object per page: `slops/<random>~<url-encoded title>.html`. The title lives in the key
so listing is a single `ListObjectsV2` — there is no index file for concurrent agents to
clobber, which is what made parallel deploys lose pages before.
