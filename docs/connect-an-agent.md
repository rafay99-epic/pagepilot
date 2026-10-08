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

## The tools

| Tool                | Input                          | What comes back                               |
| ------------------- | ------------------------------ | --------------------------------------------- |
| `deploy_page`       | `html`, optional `title`       | The page link and a deletion key              |
| `update_page`       | `id`, `html`, optional `title` | The same link, now serving the new HTML       |
| `get_page`          | `id`, optional `previous`      | The page's details, then its exact HTML       |
| `list_pages`        | optional filters, see below    | Pages as JSON, newest update first            |
| `create_upload_url` | `contentType`                  | A one-use upload URL and the image's link     |
| `delete_page`       | `id`, `deletionKey`            | A confirmation, or a note the page is missing |

`html` can be up to 900,000 UTF-8 bytes. `title` can be up to 120 characters.

## Update a page

`update_page` replaces the HTML and keeps the link, so a plan can be revised without
sending a new URL around. It needs the API key and nothing else. Leave `title` out to
keep the current one.

To revise a page from an earlier session, call `get_page` first. It returns the stored
HTML untouched, as its own text block, ready to edit and send back.

An update keeps the version it replaced. `get_page` with `previous: true` returns that
version, and sending its HTML to `update_page` undoes the update. Send its title too if
the update renamed the page. One version back is kept, until the next change or until
the page is deleted.

## Find a page

`list_pages` returns the newest update first. Every filter is optional.

| Filter   | Value                                      |
| -------- | ------------------------------------------ |
| `after`  | Only pages updated at or after this moment |
| `before` | Only pages updated before this moment      |
| `query`  | Text to find in the title or id            |
| `limit`  | 1 to 100, default 20                       |
| `cursor` | The `nextCursor` from the previous call    |

`after` and `before` take ISO 8601 with an offset, like `2026-10-01T09:00:00+05:00`.
Each page comes back with `id`, `title`, `url`, `createdAt`, `updatedAt` and `bytes`.

Each call reads the whole vault, so `list_pages` is limited to about 30 calls a minute.
Past that the tool answers with an error until the minute is up.

## Add images

Base64 in a tool call makes the model type the whole image out. Upload the file from the
shell instead:

1. Call `create_upload_url` with the image type, for example `image/png`.
2. Run the `curl` line it returns:

   ```bash
   curl -T shot.png "<upload URL>"
   ```

3. Put the returned image link in the page as `<img src="...">`. Keep the file name whole:
   PagePilot finds a page's images by their names in the HTML.

The upload URL works once and expires in 10 minutes. It carries its own signature, so
the shell never needs the API key. PNG, JPEG, WebP, GIF and AVIF are accepted, up to
10 MB each. A file that is not one of those is refused.

An image lives as long as some page embeds it, counting the earlier version an update
keeps. Once nothing embeds it, it is kept one more day and then deleted. Publish or update
a page with it inside that day and it stays. An image that was uploaded and never
embedded goes the same way, a day after the upload. When a page links an image that is
not there, the reply to `deploy_page` or `update_page` names it.

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
