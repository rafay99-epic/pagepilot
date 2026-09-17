import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type KeyboardEvent } from "react";
import { z } from "zod";
import "./style.css";

const pageListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      url: z
        .string()
        .url()
        .refine((url) => new URL(url).origin === window.location.origin),
      createdAt: z.string().datetime(),
    }),
  ),
  nextCursor: z.string().optional(),
});

const SESSION_EXPIRED = "session-expired";

async function listPages(cursor: string) {
  const response = await fetch(
    `/api/dashboard/pages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    {
      credentials: "same-origin",
      redirect: "error",
    },
  );
  if (response.status === 403 || response.status === 401)
    throw new Error("Session expired.", { cause: SESSION_EXPIRED });
  if (response.status === 503)
    throw new Error(
      "Dashboard access has not been configured. Set the Cloudflare Access team domain and audience on the Worker.",
    );
  if (!response.ok) throw new Error("Could not load pages.");
  return pageListSchema.parse(await response.json());
}

async function deletePage(id: string) {
  const response = await fetch(`/api/dashboard/pages/${id}`, {
    method: "DELETE",
    credentials: "same-origin",
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(
      "Could not delete this page. Reload to check your session and try again.",
    );
}

type Page = z.infer<typeof pageListSchema>["items"][number];

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

// Right pane: the selected page in a sandboxed iframe, loaded through the
// owner-only preview route, plus its actions. Keyed by page id in App so the
// confirmation and notice reset when the selection changes.
function PagePreview({ page }: { page: Page }) {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const remove = useMutation({
    mutationFn: deletePage,
    onSuccess: () => client.invalidateQueries({ queryKey: ["pages"] }),
  });

  return (
    <>
      <header>
        <div className="meta">
          <h2>{page.title}</h2>
          <p>
            <span className="url">{page.url}</span>
            <time dateTime={page.createdAt}>
              {new Date(page.createdAt).toLocaleString()}
            </time>
          </p>
        </div>
        {confirming ? (
          <div className="actions">
            <span className="danger">Delete permanently?</span>
            <button
              className="danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(page.id)}
            >
              Delete
            </button>
            <button disabled={remove.isPending} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="actions">
            <span role="status">{notice}</span>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(page.url);
                  setNotice("Link copied.");
                } catch {
                  setNotice("Copy failed. Select the link instead.");
                }
              }}
            >
              Copy link
            </button>
            <a
              className="button"
              href={page.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open
            </a>
            <button className="danger" onClick={() => setConfirming(true)}>
              Delete
            </button>
          </div>
        )}
      </header>
      {remove.isError && <p role="alert">{remove.error.message}</p>}
      <iframe
        title={page.title}
        src={`/api/dashboard/pages/${page.id}/preview`}
        sandbox="allow-scripts allow-popups"
        referrerPolicy="no-referrer"
      />
    </>
  );
}

// Two panes: a searchable list on the left, PagePreview on the right.
export function App() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useInfiniteQuery({
    queryKey: ["pages"],
    queryFn: ({ pageParam }) => listPages(pageParam),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor,
    retry: false,
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = items.filter((page) =>
    `${page.title} ${page.id}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = filtered.find((page) => page.id === selectedId) ?? filtered[0];

  function moveSelection(event: KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = filtered.findIndex((page) => page.id === selected?.id);
    const next = filtered[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (!next) return;
    setSelectedId(next.id);
    document.getElementById(`page-${next.id}`)?.scrollIntoView({ block: "nearest" });
  }

  return (
    <main>
      <section className="list" aria-label="Pages" onKeyDown={moveSelection}>
        <header>
          <h1>PagePilot</h1>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title or ID"
            aria-label="Search title or ID"
          />
        </header>
        {query.isPending && <p role="status">Loading…</p>}
        {query.isError && (
          <p role="alert">
            {query.error.message}{" "}
            {query.error.cause === SESSION_EXPIRED ? (
              <button onClick={() => window.location.reload()}>Sign in again</button>
            ) : (
              <button onClick={() => void query.refetch()}>Retry</button>
            )}
          </p>
        )}
        {query.data && filtered.length === 0 && (
          <p>
            {items.length ? "No match." : "No pages yet. Publish one through your agent."}
          </p>
        )}
        <ul>
          {filtered.map((page) => (
            <li key={page.id}>
              <button
                id={`page-${page.id}`}
                aria-current={page.id === selected?.id}
                onClick={() => setSelectedId(page.id)}
              >
                <span>{page.title}</span>
                <time dateTime={page.createdAt}>
                  {shortDate.format(new Date(page.createdAt))}
                </time>
              </button>
            </li>
          ))}
        </ul>
        {query.hasNextPage && (
          <button
            className="more"
            disabled={query.isFetching}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
        <footer>
          <span>
            {items.length} {items.length === 1 ? "page" : "pages"}
            {query.hasNextPage ? "+" : ""}
          </span>
          <button disabled={query.isFetching} onClick={() => void query.refetch()}>
            Refresh
          </button>
          <a href="/cdn-cgi/access/logout">Sign out</a>
        </footer>
      </section>
      <section className="preview" aria-label="Preview">
        {selected ? (
          <PagePreview key={selected.id} page={selected} />
        ) : (
          query.data && <p className="empty">Nothing selected.</p>
        )}
      </section>
    </main>
  );
}
