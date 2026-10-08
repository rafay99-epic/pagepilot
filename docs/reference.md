# Reference

The details, for when you need them.

## Routes

| Route              | Who can use it            | What it does                             |
| ------------------ | ------------------------- | ---------------------------------------- |
| `POST /api/mcp`    | Agents with the API key   | The MCP endpoint                         |
| `GET /p/<id>`      | Anyone with the link      | Serves a published page                  |
| `/dashboard/`      | The owner, through Access | The dashboard                            |
| `/api/dashboard/*` | The owner, through Access | List, preview, delete and storage report |
| `GET /`            | Anyone                    | Landing page                             |
| `GET /health`      | Anyone                    | Returns `ok`. Does not check storage     |
| `GET /robots.txt`  | Anyone                    | Tells crawlers to stay out               |

Everything else is a 404.

## Storage

Each page is one object in the bucket, `pages/<32-hex-id>.html`. The title and the hash of
the deletion key sit in the object's metadata. There is no index file and no database.

Pages from before the Worker rewrite use `pages/<12-hex-id>~<base64url-title>.html`.
PagePilot still reads, lists and deletes them, so old links keep working and nothing
needs migrating.

Old links depend on the original bucket. Point the Worker at an empty bucket and every
old page looks missing.

The dashboard's storage view adds up object sizes against R2's 10 GB free tier. One
report reads at most 20,000 objects and marks itself partial past that.

## Privacy

A page is as private as its link. The id is 128 bits, so nobody finds a page by guessing.
Whoever gets a link can still read it and forward it.

- **Sandboxed.** Pages are served with a sandbox CSP, `no-referrer` and `nosniff`.
  Scripts and HTTPS assets still run inside the sandbox.
- **Not indexed.** Every page sends `X-Robots-Tag: noindex, nofollow, noarchive`, and
  `robots.txt` disallows everything. That keeps pages out of search results. It is not
  access control.
- **Not cached.** Pages are sent `private, no-store`, so a deleted page stops loading on
  the next request. Copies already opened or downloaded cannot be recalled.
- **Not framable.** Public links refuse to load in a frame. Only the dashboard preview
  can embed a page.

Do not publish secrets. If a page should stop being readable, delete it.

## Project layout

```
src/              The Worker
  index.ts        Router
  mcp.ts          MCP endpoint and the three tools
  dashboard.ts    Owner-only dashboard routes
  access.ts       Cloudflare Access token check
  serve-page.ts   Serves /p/<id>
  pages.ts        Page lookup and listing in R2
  storage.ts      Bucket usage report
  http.ts         Shared headers and response helpers
  landing.html    Landing page, bundled into the Worker as text
shared/api.ts     Dashboard API contract, as zod schemas
dashboard/src/    React dashboard, built with Vite and TanStack Query
tests/            Worker tests, run against the built bundle in Miniflare
wrangler.jsonc    Worker config
```

The Worker and the dashboard share `shared/api.ts`. The Worker builds its responses from
those types and the dashboard parses with the same schemas, so a field one side misses
fails the build or the parse.

Dashboard assets build into `dashboard/dist/`, which git ignores. Every asset request
goes through the Worker first, so static files cannot skip the Access check.

Back to the [README](../README.md)
