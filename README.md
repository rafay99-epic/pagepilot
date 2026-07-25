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

### 3. Put your key on disk, once

```bash
printf '%s' 'your-api-key' > ~/.pagepilot && chmod 600 ~/.pagepilot
```

Every harness reads it from there, so the secret isn't pasted into config files you
might commit. `PAGEPILOT_API_KEY` in the environment still overrides it.

### 4. Configure your MCP client

Identical in every harness — no env block, no URL:

```json
{
  "mcpServers": {
    "pagepilot": {
      "command": "bun",
      "args": ["/path/to/pagepilot/tools/mcp-server/src/index.ts"]
    }
  }
}
```

The server defaults to the instance in `DEFAULT_URL` (`tools/mcp-server/src/index.ts`).
Set `PAGEPILOT_URL` only to point a harness somewhere else, e.g. `http://localhost:3000`.

## MCP Tools

- `deploy_page(html, title?, share?)` — Deploy HTML. **Private unless `share: true`.**
- `list_pages(limit?)` — List pages newest first, with each one's shared state
- `share_page(id)` — Turn a page into a public link. Returns a **new** id and URL.
- `unshare_page(id)` — Revoke the public link. The old URL dies immediately.
- `delete_page(id)` — Delete a page

## Without MCP

Any harness that can run `curl` can deploy — it's the same tRPC endpoint:

```bash
curl -X POST "https://pagepilot.rafay99.com/api/trpc/slop.deploy" \
  -H "authorization: Bearer $(cat ~/.pagepilot)" \
  -H "content-type: application/json" \
  -d '{"html":"<h1>hi</h1>","title":"My plan"}'
```

## Access model

Everything requires `PAGEPILOT_API_KEY`. Two ways to present it:

- **Agents** send `authorization: Bearer <key>`.
- **Browsers** POST the key to `/api/unlock` once, which sets an `httpOnly` `Secure`
  `SameSite=Lax` cookie. `httpOnly` means page scripts can't read your key;
  `SameSite=Lax` means a hostile site can't POST a delete on your behalf.

Pages are **private by default** — `/view/<id>` answers `404` unless the page is shared
or you're authenticated. It's `404` rather than `401` so a guess can't confirm that an id
exists, and the check runs before touching R2 so probing costs nothing.

`share_page` makes one page readable by anyone holding its link. Shared pages still send
`X-Robots-Tag: noindex, nofollow, noarchive`, and `robots.txt` disallows `/view/`, so a
leaked link can't turn into a search result. Be clear-eyed about what a shared link is:
anyone you send it to can forward it, and Slack, Discord and Notion all fetch it
server-side to build previews. Share deliberately, unshare when done.

## Storage layout

One object per page: `slops/<p|s>-<random>~<base64url title>.html`.

Share state and title both live in the key, so a single `ListObjectsV2` answers what
exists, what it's called and what's public — no index file for concurrent agents to
clobber, and no per-item `HeadObject`. Flipping share state rewrites the id, which is
why unsharing genuinely revokes a link instead of just hiding it. Anything without an
`s-` marker is treated as private, so unrecognised ids fail closed.

**Use a bucket dedicated to PagePilot, with public access off.** If you enable R2's
public development URL or attach a public custom domain to the bucket, every object is
fetchable directly and all of the above is decoration.
