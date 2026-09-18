import { useQuery } from "@tanstack/react-query";
import { useState, type KeyboardEvent } from "react";
import type { Page } from "../../shared/api";
import { listAllPages } from "./api";
import { shortDate } from "./format";
import { PagePreview } from "./page-preview";
import { QueryError } from "./query-error";

const monthLabel = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

// Pages arrive newest first, so grouping in order keeps months in order too.
function groupByMonth(pages: Page[]) {
  const groups = new Map<string, Page[]>();
  for (const page of pages) {
    const label = monthLabel.format(new Date(page.createdAt));
    groups.set(label, [...(groups.get(label) ?? []), page]);
  }
  return [...groups];
}

// Two panes: a searchable list on the left, PagePreview on the right. On a
// phone only one shows at a time; `open` says whether the preview is up.
export function PagesView() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const query = useQuery({ queryKey: ["pages"], queryFn: listAllPages, retry: false });
  const items = query.data ?? [];
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
    <div className={open ? "pages-view open" : "pages-view"}>
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
        <div className="rows">
          {groupByMonth(filtered).map(([month, pages]) => (
            <section key={month} aria-label={month}>
              <h2>{month}</h2>
              <ul>
                {pages.map((page) => (
                  <li key={page.id}>
                    <button
                      id={`page-${page.id}`}
                      aria-current={page.id === selected?.id}
                      onClick={() => {
                        setSelectedId(page.id);
                        setOpen(true);
                      }}
                    >
                      <span>{page.title}</span>
                      <time dateTime={page.createdAt}>
                        {shortDate.format(new Date(page.createdAt))}
                      </time>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <footer>
          <span>
            {items.length} {items.length === 1 ? "page" : "pages"}
          </span>
          <button disabled={query.isFetching} onClick={() => void query.refetch()}>
            Refresh
          </button>
        </footer>
      </section>
      <section className="preview" aria-label="Preview">
        {selected ? (
          <PagePreview key={selected.id} page={selected} onBack={() => setOpen(false)} />
        ) : (
          query.data && <p className="empty">Nothing selected.</p>
        )}
      </section>
    </div>
  );
}
