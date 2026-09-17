# PagePilot

Publish HTML from an AI agent and get a shareable link. PagePilot is a backend-only
Cloudflare Worker using TypeScript, the official MCP SDK, Zod, and native R2 bindings.
No Next.js, React, Clerk, dashboard, database, or Vercel runtime is required.

- MCP endpoint: `https://pagepilot.rafay99.com/api/mcp`
- Published pages: `https://pagepilot.rafay99.com/p/<id>`
- Existing vault: private R2 bucket `html-slop`

## What changed

The Next.js application and frontend were replaced by one Worker in `src/index.ts`.
Native R2 bindings replace S3 signing and XML parsing. New pages stream directly from
R2, and the original bucket is reused rather than migrated.

Existing 12-character page links remain supported. New pages use 32-character UUID
IDs with titles stored in R2 metadata. Publishing, listing, and deleting still use
the same three MCP tools and Bearer API-key authentication.

## Run locally

Requires Node.js 24+ and Bun. Run commands from the repository root:

```bash
bun install
cp .dev.vars.example .dev.vars
openssl rand -hex 32
```

Put the generated value in `.dev.vars` as `PAGEPILOT_API_KEY`, then start:

```bash
bun run dev
```

Connect to `http://localhost:8787/api/mcp` with that key. Local development uses
emulated R2, not the live bucket. `.dev.vars` is ignored by Git. Wrangler can load
old `.env.local` values when `.dev.vars` is absent, so use `.dev.vars` to avoid stale
settings. R2 access keys and Clerk credentials are no longer required.

## Deploy to Cloudflare

### New installation

1. Log in to the Cloudflare account that will own the Worker and bucket:

   ```bash
   bunx wrangler login
   ```

2. Choose a private R2 bucket and set `bucket_name` in both configurations in
   `wrangler.jsonc`. Create a bucket only for a new installation; **keep `html-slop`
   for this existing vault**. Leave public bucket access disabled.
3. Set the API key and deploy:

   ```bash
   bun run secret
   bun run deploy
   ```

   The secret command prompts for `PAGEPILOT_API_KEY`. If Wrangler offers to create
   the Worker first, accept. Use the workers.dev URL printed by deployment, with
   `/api/mcp` appended. No build output or HTML directory needs uploading manually.

### Existing PagePilot deployment

The last verified live hostname was attached to Worker `pagepilot-preview`, using
`html-slop`. That historical Worker name does not change the app name or page URLs.
The repository now names the Worker `pagepilot`; editing that name does **not** rename
an existing deployment or transfer its domain and secret.

Until the domain is deliberately moved to `pagepilot`, update the working deployment
without changing routing:

```bash
bunx wrangler deploy --env '' --name pagepilot-preview
```

To rotate its secret, target the same Worker explicitly:

```bash
bunx wrangler secret put PAGEPILOT_API_KEY --env '' --name pagepilot-preview
```

Do not delete the existing Worker or bucket during a rename. Confirm the current
custom-domain association in Cloudflare before choosing a deployment command.

### Custom domain and production

The production configuration targets `pagepilot.rafay99.com`, sets `PUBLIC_URL` to
that origin, and disables workers.dev access. For your own installation, replace
both domain values in `wrangler.jsonc`.

A Worker Custom Domain requires an active Cloudflare zone in the same account.
Other sites can remain hosted on Vercel while Cloudflare manages DNS. Preserve all
unrelated DNS records; a CNAME to workers.dev alone is not a custom-domain setup.

Once ready to attach the domain to Worker `pagepilot`:

```bash
bun run secret:production
bun run deploy:production
```

Store the same key used by your agents. Resolve an existing Worker domain association
or conflicting Vercel CNAME as part of the planned cutover. Verify old page links
before removing the previous deployment.

**Default and production configurations currently share Worker name `pagepilot`
and bucket `html-slop`. They are not isolated staging environments.** After production
cutover, use `deploy:production` for updates; the default command has different domain
and workers.dev settings. For isolated testing, configure a separate Worker and bucket.

## Connect agents

Use these settings in Claude Code, Codex, OpenCode, Command Code, or another
Streamable HTTP MCP client:

| Setting     | Value                                   |
| ----------- | --------------------------------------- |
| Server name | `pagepilot`                             |
| URL         | `https://pagepilot.rafay99.com/api/mcp` |
| Header      | `Authorization: Bearer YOUR_API_KEY`    |

For Claude Code:

```bash
claude mcp add --transport http pagepilot \
  https://pagepilot.rafay99.com/api/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

Replace the placeholder locally. Never commit the key or put it in a URL. After a
key rotation, update each client's header and restart clients that cache MCP settings.

## Routes and tools

| Route                       | Behavior                                           |
| --------------------------- | -------------------------------------------------- |
| `POST /api/mcp`             | Authenticated, stateless MCP with JSON responses   |
| `GET` or `HEAD /p/:id`      | Published HTML, accessible to anyone with the link |
| `GET` or `HEAD /health`     | Returns `ok`; liveness only, not a storage check   |
| `GET` or `HEAD /robots.txt` | Requests that crawlers avoid indexing              |
| `/` and other paths         | 404; there is intentionally no frontend            |

- `deploy_page({html, title?})`: publishes nonempty HTML up to 900,000 UTF-8 bytes;
  optional title is limited to 120 UTF-16 code units. Returns text with the link.
- `list_pages({cursor?})`: arguments may be omitted. Returns JSON in MCP text content
  with `items: [{id, title, url, createdAt}]` and optional `nextCursor`. Up to 100
  entries per call in object-key order, not newest-first.
- `delete_page({id})`: permanently deletes the page or reports that it is missing.

Missing or incorrect keys return 401; an unconfigured server key returns 503.
Authenticated non-POST MCP requests return 405. Cross-origin browser requests are
rejected. There are no persistent sessions or SSE subscriptions. Raw MCP requests
need `Content-Type: application/json` and `Accept: application/json, text/event-stream`.

## Storage, old links, and privacy

Legacy objects use `pages/<12-hex-id>~<base64url-title>.html`. New objects use
`pages/<32-hex-id>.html` with title metadata. Both formats are readable, listable,
and deletable. No bulk migration is needed. Old links require both the original
hostname and original bucket; switching to an empty bucket makes intact pages look missing.

The API key protects write operations and listing, **not page reads**. Anyone holding
a page link can view or forward it. HTML is served with sandbox CSP, `no-referrer`,
and `nosniff`. Scripts and HTTPS assets remain allowed inside the sandbox; do not
publish secrets. Robots directives are not access control.

Responses use `private, no-store`, so new requests after deletion reach storage.
Already opened pages and downloaded copies cannot be revoked. Each view still uses
a Worker invocation and R2 read. The old Vercel application cannot read the new key
format, so rolling back only DNS will not restore newly published pages there.

## Logs and checks

Both configurations enable persisted invocation logs with sampling rate `1`.
Traces are disabled. Settings take effect when deployed to the intended Worker.
View logs in Cloudflare's Worker dashboard. Invocation logs can contain page URLs;
restrict access and never log authorization headers or HTML contents.

```bash
bun run test
bun run typecheck
bun run lint
bun run build
```

Tests run the bundled Worker in Miniflare with temporary local R2 storage. They cover
MCP connection, authentication, CRUD, legacy links, pagination, limits, and response
headers. `build` is a deployment dry run and does not publish anything.

After deployment, check `/health`, rejection without a key, an existing page link,
and a disposable upload/list/delete cycle through your agent.

- **Vercel `DEPLOYMENT_NOT_FOUND`:** traffic still reaches Vercel. Check the domain
  association and DNS caches; this error does not mean R2 objects were deleted.
- **Worker `Not found` on an old page:** check `PAGES` is bound to `html-slop` and
  the corresponding object exists. A 404 at `/` is expected.
- **401 from MCP:** the client's key does not match the secret on the Worker serving
  that hostname. Updating a local env file alone does not rotate the hosted secret.
