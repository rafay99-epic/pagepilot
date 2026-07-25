# PagePilot

> A private HTML vault for AI agents. One hosted MCP endpoint, backed by your own
> Cloudflare R2 bucket. No dashboard, nothing to clone, nothing to run locally.

```
AI Agent ──HTTP──> /api/mcp (MCP server, hosted) ──S3 SDK──> Cloudflare R2
                        │
                   /view/<id>  ← private by default, shareable on request
```

The MCP server _is_ the application. There is no management UI and no separate API —
publishing, listing, sharing and deleting all happen through MCP tools, so there is one
authenticated surface instead of three.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/rafay99-epic/pagepilot&root-directory=apps/web&env=R2_ACCOUNT_ID,R2_ACCESS_KEY_ID,R2_SECRET_ACCESS_KEY,R2_BUCKET,PAGEPILOT_API_KEY)

## Setup

### 1. Create an R2 bucket

Cloudflare Dashboard → R2 → Create Bucket. Use a bucket dedicated to PagePilot and
**leave public access disabled** — no public development URL, no public custom domain on
the bucket. Otherwise every page is fetchable straight from R2 and the access rules below
mean nothing.

Then create an API token with _Object Read & Write_ on that bucket.

### 2. Deploy to Vercel

Import the repo with **Root Directory** set to `apps/web`, leaving the build command on
the default `next build`. Then set:

| Variable               | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `R2_ACCOUNT_ID`        | Cloudflare R2 account ID (32-hex, on the R2 overview page)        |
| `R2_ACCESS_KEY_ID`     | R2 API token access key                                           |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret                                               |
| `R2_BUCKET`            | Bucket name                                                       |
| `PAGEPILOT_API_KEY`    | The key you generate below. Guards every tool.                    |
| `PUBLIC_URL`           | Optional — only for a custom domain. Defaults to your Vercel URL. |

### 3. Generate your API key

Nobody issues this — you choose it. It is the only credential your agents ever see, and
your `R2_*` credentials never leave the server.

```bash
openssl rand -hex 32
```

Use the same value for `PAGEPILOT_API_KEY` in Vercel and in the MCP config below.

### 4. Connect your agent

```bash
claude mcp add --transport http pagepilot \
  https://pagepilot.rafay99.com/api/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

Anything that reads an `mcp.json` — Cursor, OpenCode, Command Code, Claude Desktop —
takes the same thing:

```json
{
  "mcpServers": {
    "pagepilot": {
      "type": "http",
      "url": "https://pagepilot.rafay99.com/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

## Tools

- `deploy_page(html, title?, share?)` — Publish HTML. **Private unless `share: true`.**
- `list_pages()` — The vault, newest first, with each page's shared state
- `share_page(id)` — Mint a public link. Returns a **new** id and URL.
- `unshare_page(id)` — Revoke the public link. The old URL dies immediately.
- `delete_page(id)` — Delete a page

## Access model

`PAGEPILOT_API_KEY` guards the MCP endpoint. Agents send it as `Authorization: Bearer`.

Pages are **private by default**. `/view/<id>` answers `404` unless the page is shared or
the caller is authenticated — `404` rather than `401` so a guess can't confirm an id
exists, and the check runs before touching R2 so probing costs nothing.

To read your own pages in a browser, visit `/unlock` once and enter the key. It becomes an
`httpOnly` `Secure` `SameSite=Lax` cookie: `httpOnly` so no page script can read your key,
`SameSite=Lax` so a hostile site can't act as you. That page is the only UI in the app and
it manages nothing.

`share_page` makes one page readable by anyone holding its link. Shared pages still send
`X-Robots-Tag: noindex, nofollow, noarchive` and `robots.txt` disallows `/view/`, so a
leaked link can't become a search result. Be clear-eyed about what a shared link is:
anyone you send it to can forward it, and Slack, Discord and Notion all fetch it
server-side to build previews. Share deliberately, unshare when done.

## Storage layout

One object per page: `pages/<p|s>-<random>~<base64url title>.html`.

Share state and title both live in the key, so a single `ListObjectsV2` answers what
exists, what it's called and what's public — no index file for concurrent agents to
clobber, and no per-item `HeadObject`. Flipping share state rewrites the id, which is why
unsharing genuinely revokes a link instead of just hiding it. Anything without an `s-`
marker is treated as private, so unrecognised ids fail closed.

## Local development

```bash
bun install
bun run dev     # :3000
bun run test    # round-trips real pages through your bucket
```

Copy `.env.example` to `.env.local` and fill it in. Point an agent at
`http://localhost:3000/api/mcp` to exercise the tools against your own instance.
