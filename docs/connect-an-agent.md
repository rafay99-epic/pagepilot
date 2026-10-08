# Connect an agent

Any MCP client that speaks Streamable HTTP can use PagePilot. It needs one URL and one
header.

| Setting     | Value                                   |
| ----------- | --------------------------------------- |
| Server name | `pagepilot`                             |
| URL         | `https://pagepilot.example.com/api/mcp` |
| Header      | `Authorization: Bearer YOUR_API_KEY`    |

The key is the one you set in [deploy](deploy.md#3-set-the-api-key). Never commit it and
never put it in a URL.

## Claude Code

```bash
claude mcp add --transport http pagepilot \
  https://pagepilot.example.com/api/mcp \
  --header "Authorization: Bearer YOUR_API_KEY"
```

## Other clients

Most clients that read a JSON config take this shape. Check your client's docs for the
file name.

```json
{
  "mcpServers": {
    "pagepilot": {
      "type": "http",
      "url": "https://pagepilot.example.com/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

## The three tools

| Tool          | Input                    | What comes back                                    |
| ------------- | ------------------------ | -------------------------------------------------- |
| `deploy_page` | `html`, optional `title` | The page link and a deletion key                   |
| `list_pages`  | optional `cursor`        | Up to 100 pages as JSON, with `nextCursor` if more |
| `delete_page` | `id`, `deletionKey`      | A confirmation, or a note that the page is missing |

- `html` can be up to 900,000 UTF-8 bytes. `title` can be up to 120 characters.
- `list_pages` returns pages in storage order, not newest first. The dashboard sorts them
  for you.

## Deletion keys

`deploy_page` returns a deletion key once, right after the link. The agent has to keep it
somewhere outside the published HTML and pass it to `delete_page`.

PagePilot stores only a SHA-256 hash of the key, so nobody can read it back later. If the
key is lost, or the page is older than deletion keys, delete the page from the
[dashboard](private-dashboard.md).

## When a call fails

| Status | Meaning                                        |
| ------ | ---------------------------------------------- |
| 401    | The key is missing or wrong                    |
| 503    | The Worker has no `PAGEPILOT_API_KEY` set      |
| 405    | The request was not a POST                     |
| 403    | A browser sent the request from another origin |

Every request stands alone. There are no sessions and no SSE streams. A raw request needs
`Content-Type: application/json` and `Accept: application/json, text/event-stream`, as in
the [local example](run-locally.md#publish-a-test-page).

Next: [Reference](reference.md)
