# Deploy to Cloudflare

PagePilot is one Worker and one R2 bucket. Four steps put it online.

## You need

- A Cloudflare account with R2 turned on
- The repo installed with `bun install`

## 1. Log in

```bash
bunx wrangler login
```

## 2. Create a private bucket

```bash
bunx wrangler r2 bucket create my-pagepilot
```

Put that name in `wrangler.jsonc`. `bucket_name` appears twice, once at the top level and
once under `env.production`. Change both.

Keep public access on the bucket off. With it on, anyone can read every page straight
from R2 and skip the Worker.

## 3. Set the API key

Nobody issues this key. You make it up, and it is the only credential your agents see.
Use a generated value, not a phrase: upload URLs are signed with it.

```bash
openssl rand -hex 32
bun run secret
```

Paste the generated value when Wrangler asks. If Wrangler offers to create the Worker
first, say yes.

## 4. Deploy

```bash
bun run deploy
```

Wrangler prints a `workers.dev` URL. Check it:

```bash
curl https://pagepilot.<your-subdomain>.workers.dev/health
```

`ok` means you are live. Your MCP endpoint is that URL plus `/api/mcp`. Now
[connect an agent](connect-an-agent.md).

## Use your own domain

The [private dashboard](private-dashboard.md) needs this, because Cloudflare Access
protects hostnames on a zone in your account.

1. Make sure the domain is an active zone in the same Cloudflare account.
2. In `wrangler.jsonc`, under `env.production`, replace `pagepilot.rafay99.com` in both
   `routes` and `PUBLIC_URL` with your hostname.
3. Set the key and deploy:

   ```bash
   bun run secret:production
   bun run deploy:production
   ```

The production config turns `workers.dev` off, so the Worker answers only on your domain.
From here on, deploy with `bun run deploy:production`.

Both configs deploy the same Worker, named `pagepilot`, on the same bucket. They are two
setups for one Worker, not staging and production. For a real test environment, use a
second Worker and a second bucket.

## Rotate the API key

Run `bun run secret:production` again, or `bun run secret` on a `workers.dev` setup, then
update the header in every agent. Restart agents that cache their MCP settings.

## Updating pagepilot.rafay99.com

This part applies only to the hosted instance.

- The live Worker is named `pagepilot-preview`, not `pagepilot`.
- Its bucket is `html-slop`, which holds every existing link. Never rename or recreate it.
- A push to the `cloudflare` branch deploys on its own through Workers Builds.
- `bun run deploy:production` targets a different Worker that has none of the live
  secrets, view counts or image references. Leave it alone until the domain is moved on
  purpose.

Manual fallback:

```bash
bun run build:dashboard
bunx wrangler deploy --env '' --name pagepilot-preview
```

## If something looks wrong

| Symptom                         | Likely cause                                                                |
| ------------------------------- | --------------------------------------------------------------------------- |
| 401 from `/api/mcp`             | The agent's key differs from the secret on the Worker                       |
| 503 from `/api/mcp`             | `PAGEPILOT_API_KEY` is not set on that Worker                               |
| `Not found` on an old page link | `PAGES` is bound to a different bucket, or the object is gone               |
| 503 from `/dashboard/`          | Access is not configured yet. See [private dashboard](private-dashboard.md) |

Logs and traces are on with full sampling. Read them in the Cloudflare dashboard, under
the Worker's Observability tab. They can contain page URLs, so keep that access tight.

Next: [Private dashboard](private-dashboard.md)
