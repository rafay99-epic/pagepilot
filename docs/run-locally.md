# Run locally

Three commands give you a full PagePilot on your machine. Local runs use an emulated R2
bucket kept in `.wrangler/`, so nothing touches real storage.

## You need

- [Bun](https://bun.sh) 1.2 or newer
- Node.js 24 or newer

## Start it

```bash
bun install
cp .dev.vars.example .dev.vars
bun run dev
```

`bun run dev` builds the dashboard, then starts the Worker on port 8787. The example file
sets `PAGEPILOT_API_KEY=local-dev-key`, which is fine for local work.

| URL                             | What you get     |
| ------------------------------- | ---------------- |
| `http://localhost:8787/`        | Landing page     |
| `http://localhost:8787/health`  | `ok`             |
| `http://localhost:8787/api/mcp` | The MCP endpoint |
| `http://localhost:8787/p/<id>`  | A published page |

## Publish a test page

```bash
curl -s http://localhost:8787/api/mcp \
  -H "Authorization: Bearer local-dev-key" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"deploy_page","arguments":{"title":"Hello","html":"<h1>Hello from PagePilot</h1>"}}}'
```

The reply holds a `http://localhost:8787/p/<id>` link and a deletion key. Open the link.

Or point a real agent at your machine:

```bash
claude mcp add --transport http pagepilot-local \
  http://localhost:8787/api/mcp \
  --header "Authorization: Bearer local-dev-key"
```

## The dashboard stays closed locally

`/dashboard/` answers 503 on your machine. That is on purpose. The dashboard trusts only
a signed Cloudflare Access login, and there is no local bypass to forget about later.

`bun run dev:dashboard` starts Vite at `http://127.0.0.1:5173/dashboard/` for layout and
styling work. Its API calls still need a real Access session. To use the dashboard for
real, [deploy](deploy.md) and then [set up Access](private-dashboard.md).

## Checks

| Command             | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `bun run test`      | Builds, then runs the Worker tests in Miniflare     |
| `bun run typecheck` | Type checks the Worker, the tests and the dashboard |
| `bun run lint`      | Runs oxlint and rejects `any`                       |
| `bun run build`     | Dry run of a deploy. Publishes nothing              |
| `bun run format`    | Formats the code and these docs with Prettier       |

Next: [Deploy to Cloudflare](deploy.md)
