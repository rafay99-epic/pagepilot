import { useInfiniteQuery } from "@tanstack/react-query";
import { useState, type KeyboardEvent } from "react";
import { listPages } from "./api";
import { shortDate } from "./format";
import { PagePreview } from "./page-preview";
import { QueryError } from "./query-error";

// Two panes: a searchable list on the left, PagePreview on the right.
export function PagesView() {
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
    <div className="pages-view">
      <section className="list" aria-label="Pages" onKeyDown={moveSelection}>
        <header>
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
          <QueryError error={query.error} onRetry={() => void query.refetch()} />
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
        </footer>
      </section>
      <section className="preview" aria-label="Preview">
        {selected ? (
          <PagePreview key={selected.id} page={selected} />
        ) : (
          query.data && <p className="empty">Nothing selected.</p>
        )}
      </section>
    </div>
  );
}
