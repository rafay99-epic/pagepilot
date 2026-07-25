# PagePilot

> A private HTML vault for AI agents. One hosted MCP endpoint, backed by your own
> Cloudflare R2 bucket. No dashboard, nothing to clone, nothing to run locally.

```
AI Agent ──HTTP──> /api/mcp (MCP server, hosted) ──S3 SDK──> Cloudflare R2
                        │
                     /p/<id>  ← short link, readable by anyone holding it
```

The MCP server _is_ the application. There is no dashboard, no login and no separate API —
publishing, listing and deleting all happen through MCP tools, so there is one
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

- `deploy_page(html, title?)` — Publish HTML, get back a short URL
- `list_pages()` — The vault, newest first
- `delete_page(id)` — Delete a page. The URL dies immediately.

## Access model

`PAGEPILOT_API_KEY` guards the MCP endpoint — publishing, listing and deleting. Agents
send it as `Authorization: Bearer`. Without it nobody can enumerate your vault or write to
it.

**Reading a page is unauthenticated.** There is no login and no cookie: the 12-character,
48-bit id in `/p/<id>` _is_ the credential, so a page is exactly as private as its link.
Nobody finds pages by guessing or crawling, and every page sends
`X-Robots-Tag: noindex, nofollow, noarchive` with `robots.txt` disallowing `/p/`, so a
leaked link can't become a search result.

Be clear-eyed about what that is, though: whoever you send a link to can forward it, and
Slack, Discord and Notion all fetch a URL server-side to build previews. If a page should
stop being readable, `delete_page` it.

## Storage layout

One object per page: `pages/<id>~<base64url title>.html`, where `<id>` is 12 hex
characters.

The id alone goes in the URL, so links stay short. The title still lives in the key, which
keeps listing to a single `ListObjectsV2` — no index file for concurrent agents to clobber
and no per-item `HeadObject`. Reading one page costs a prefix list to recover the key,
anchored on the `~` so a short id can't match a longer one.

## Local development

```bash
bun install
bun run dev     # :3000
bun run test    # round-trips real pages through your bucket
```

Copy `.env.example` to `.env.local` and fill it in. Point an agent at
`http://localhost:3000/api/mcp` to exercise the tools against your own instance.
