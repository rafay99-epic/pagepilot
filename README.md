# PagePilot

Backend-only HTML publishing for agents. One Cloudflare Worker, a private R2 bucket,
and the official MCP SDK. No Next.js, React, Clerk, Vercel, database, or frontend.

Production endpoint stays `https://pagepilot.rafay99.com/api/mcp`.

## Local development

Requires Node.js 24+ and Bun. Run commands from the repository root.

```bash
bun install
```

Create `.dev.vars` using `.dev.vars.example` and set `PAGEPILOT_API_KEY` to a strong
random value. Generate a key locally with `openssl rand -hex 32`. Never commit it.
Wrangler does not use the old `.env.local` for Worker bindings; R2 credentials and
Clerk variables are no longer needed.

```bash
bun run dev
```

Local endpoint: `http://localhost:8787/api/mcp`. Wrangler uses local emulated R2,
not the live bucket. A missing or empty key makes MCP return 503 rather than allow access.

```bash
bun run test
bun run typecheck
bun run lint
bun run format:check
bun run build
```

Tests bundle the Worker and run it in Miniflare with temporary local R2 storage.
They exercise the official MCP client, authentication, uploads, legacy links,
pagination, HTML security headers, limits, and deletion. No account login or live
bucket access is required. `build` is a deployment dry run, not a deployment.

## Deploy a preview first

The default configuration is deliberately separate from production:

| Setting     | Preview                             | Production                                       |
| ----------- | ----------------------------------- | ------------------------------------------------ |
| Worker name | `pagepilot-preview`                 | `pagepilot`                                      |
| R2 bucket   | `pagepilot-preview`                 | `pagepilot`, verify against your existing bucket |
| Host        | workers.dev URL printed by Wrangler | `pagepilot.rafay99.com`                          |
| Command     | `bun run deploy`                    | `bun run deploy:production`                      |

Log in to the Cloudflare account that owns your R2 bucket and domain:

```bash
bunx wrangler login
bunx wrangler r2 bucket create pagepilot-preview
bun run secret
bun run deploy
```

Skip bucket creation if it already exists. `secret` prompts for
`PAGEPILOT_API_KEY`; if Wrangler offers to create the preview Worker before storing
its first secret, accept. Use a separate preview key. Keep R2 public access disabled,
including its r2.dev URL and public bucket custom domains.

Use the workers.dev URL printed by Wrangler, with `/api/mcp` appended, in a temporary
agent configuration. Preview-generated page URLs use that same preview host.

Verify before cutover:

- `GET /health` returns `ok`. This checks the Worker, not storage connectivity.
- `/api/mcp` without a key or with a wrong key returns 401.
- Your agent connects using the preview key and discovers all three tools.
- Publish an HTML page, open its returned URL, list it, and delete it.
- Opening the deleted URL returns 404.

This preview uses a different bucket. It neither changes existing pages nor moves DNS.
Do not enable Vercel preview builds for this branch: `apps/web` no longer exists here.

## Production cutover, only after preview passes

**The production deploy connects the live hostname to Cloudflare. Do not run it
until you are ready to move traffic. Keep Vercel running until verification passes.**

1. Confirm `rafay99.com` is an active zone in the same Cloudflare account.
2. In `wrangler.jsonc`, set `env.production.r2_buckets[0].bucket_name` to the
   existing PagePilot bucket. The default is `pagepilot`; no bucket content is
   migrated or deleted by deployment. Keep the bucket private.
3. Store the production secret:

   ```bash
   bun run secret:production
   ```

   Use your existing PagePilot API key to keep current agent configurations working.
   If Wrangler offers to create the production Worker for its first secret, accept;
   this command does not attach the custom domain. Secrets are separate per Worker.

4. Record the existing Vercel DNS record and its proxy setting for rollback.
   Cloudflare cannot attach a Worker Custom Domain over an existing CNAME record.
   At cutover, remove the conflicting `pagepilot` CNAME and immediately deploy:

   ```bash
   bun run deploy:production
   ```

   Cloudflare creates the custom-domain DNS record and certificate. Allow for
   provisioning time. Do not change unrelated DNS records. Resolve any conflicting
   hostname record before retrying; do not delete the Vercel project.

5. Verify `https://pagepilot.rafay99.com/health`, unauthenticated 401 responses,
   an existing page link, and publish/list/delete through the production MCP endpoint.
   Delete only a disposable page you created for the test.
6. After verification, disable Vercel deployment automation and take down the old
   Vercel deployment when you are satisfied. Remove its stale R2 credentials only
   after confirming nothing else needs them.

If cutover fails, remove the Worker's custom-domain association and restore the
recorded Vercel DNS record. Existing legacy pages still work on Vercel. **Pages
created by this new Worker use a different key format and are not readable by the
old Vercel application.** Keep those R2 objects; restore the Worker to serve them.
Do not run both versions as active writers during the cutover.

## Agent connection

Configure a Streamable HTTP MCP server with:

- URL: `https://pagepilot.rafay99.com/api/mcp`
- Header: `Authorization: Bearer YOUR_API_KEY`

For Claude Code:

```bash
claude mcp add --transport http pagepilot \
  https://pagepilot.rafay99.com/api/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

Replace the placeholder locally. Client-specific configuration formats vary; the
endpoint and authorization header stay the same. Never put the key in a URL.

## API and tools

| Route                       | Behavior                                             |
| --------------------------- | ---------------------------------------------------- |
| `POST /api/mcp`             | API-key-protected, stateless MCP with JSON responses |
| `GET` or `HEAD /p/:id`      | Published HTML, readable by anyone holding the link  |
| `GET` or `HEAD /health`     | Plain-text liveness check                            |
| `GET` or `HEAD /robots.txt` | Disallow indexing                                    |
| Anything else               | 404, no dashboard or landing page                    |

Authenticated non-POST MCP requests return 405. There are no persistent sessions or
SSE subscriptions. Cross-origin browser requests are rejected; non-browser agents
may omit Origin. Send `Content-Type: application/json` and
`Accept: application/json, text/event-stream` for raw MCP requests.

- `deploy_page({html, title?})`: up to 900,000 UTF-8 bytes of nonempty HTML. Optional
  title is at most 120 UTF-16 code units and is trimmed. Returns text containing the
  title and link.
- `list_pages({cursor?})`: arguments may be omitted. Returns a JSON string in MCP
  text content containing `items: [{id, title, url, createdAt}]` and optional
  `nextCursor`. Pass it as `cursor` to continue. Up to 100 entries per call, ordered
  by object key, not creation date. An empty vault returns `items: []`.
- `delete_page({id})`: deletes an existing object or reports a missing page.

Missing/wrong credentials return 401; missing server key returns 503; disallowed
Origin returns 403; invalid JSON returns 400; wrong content type returns 415;
requests larger than 5,416,384 bytes return 413. The request cap allows JSON escaping
of a valid 900 KB page. Tool validation/storage failures return MCP errors rather
than revealing storage diagnostics or credentials.

## Storage and security

New objects use `pages/<32-hex UUID>.html`, with title in R2 custom metadata.
Reading a new page takes one native R2 GET and streams the body without decoding
HTML. Listing includes custom metadata, without per-page HEAD calls. No S3 signing
or XML parsing is needed.

Existing `pages/<12-hex-id>~<base64url-title>.html` objects remain readable, listable,
and deletable. Legacy reads use a fallback prefix lookup. Old URLs stay unchanged.
There is no bulk migration.

The API key protects publishing, listing, and deletion. **Page reads remain public
to anyone with the link.** New IDs contain 122 random UUID bits; old IDs keep their
48-bit entropy. Forwarded links, previews, and downloaded copies can expose content.
Robots directives are advisory, not authentication.

HTML responses preserve the sandbox CSP without `allow-same-origin`, prohibit
forms and embedding, and use `no-referrer` and `nosniff`. Scripts and HTTPS assets
are allowed within the sandbox, so uploaded HTML can still make outbound requests.
Do not upload secrets.

Page responses use `private, no-store`. No CDN or browser cache is configured;
new requests after deletion reach storage. Already opened pages or saved copies
cannot be revoked. Old Vercel-cached responses may remain during cutover. This
keeps deletion predictable; repeated views still cost a Worker invocation and R2 GET.
