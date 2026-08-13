"use client";

import { useActionState, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, LoaderCircle, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { removePage, updatePage, type ActionState } from "./actions";

const initialActionState: ActionState = { status: "idle", message: "" };

export function PageRow({
  id,
  title,
  url,
  createdAt,
}: {
  id: string;
  title: string;
  url: string;
  createdAt: string;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [updateState, updateAction, updating] = useActionState(
    updatePage,
    initialActionState,
  );
  const [deleteState, deleteAction, deleting] = useActionState(
    removePage,
    initialActionState,
  );

  useEffect(() => {
    if (updateState.status === "success") setEditing(false);
  }, [updateState]);

  const state = deleteState.status !== "idle" ? deleteState : updateState;

  return (
    <div className="grid gap-4 px-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5">
      <div className="min-w-0">
        {editing ? (
          <form action={updateAction} className="flex max-w-2xl items-center gap-2">
            <input type="hidden" name="id" value={id} />
            <input
              name="title"
              defaultValue={title}
              required
              maxLength={120}
              autoFocus
              aria-label={`Rename ${title}`}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 h-9 min-w-0 flex-1 rounded-lg border px-3 text-sm font-medium outline-none"
            />
            <Button type="submit" size="sm" disabled={updating}>
              {updating ? <LoaderCircle className="animate-spin" /> : <Check />}
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Cancel editing"
              title="Cancel"
              onClick={() => setEditing(false)}
              disabled={updating}
            >
              <X />
            </Button>
          </form>
        ) : (
          <div className="flex min-w-0 items-center">
            <h2 className="truncate font-medium">{title || "Untitled page"}</h2>
          </div>
        )}
        <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 text-xs">
          <code>{id}</code>
          <time dateTime={createdAt}>{new Date(createdAt).toLocaleString()}</time>
          {state.message && (
            <span
              aria-live="polite"
              className={
                state.status === "error" ? "text-destructive" : "text-emerald-400"
              }
            >
              {state.message}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:justify-end">
        {!editing && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Edit ${title}`}
            title="Edit title"
            onClick={() => setEditing(true)}
          >
            <Pencil />
          </Button>
        )}
        <Button variant="ghost" size="icon" asChild title="Open page">
          <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${title}`}>
            <ExternalLink />
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title={copied ? "Copied" : "Copy link"}
          aria-label={`Copy link for ${title}`}
          onClick={async () => {
            await navigator.clipboard.writeText(new URL(url, location.origin).href);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="text-emerald-400" /> : <Copy />}
        </Button>
        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (!confirm(`Delete “${title}” permanently?`)) event.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            title="Delete page"
            aria-label={`Delete ${title}`}
            disabled={deleting}
            className="text-destructive hover:text-destructive"
          >
            {deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}
          </Button>
        </form>
      </div>
    </div>
  );
}
