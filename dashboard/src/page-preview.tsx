import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Page } from "../../shared/api";
import { deletePage } from "./api";

// Right pane: the selected page in a sandboxed iframe, loaded through the
// owner-only preview route, plus its actions. Keyed by page id in PagesView
// so the confirmation and notice reset when the selection changes.
export function PagePreview({ page }: { page: Page }) {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [notice, setNotice] = useState("");
  const remove = useMutation({
    mutationFn: deletePage,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["pages"] });
      client.invalidateQueries({ queryKey: ["storage"] });
    },
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
