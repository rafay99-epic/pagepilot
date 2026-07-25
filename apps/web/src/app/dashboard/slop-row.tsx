"use client";

import { trpc } from "@/trpc/client";

type SlopRowProps = {
  slop: { id: string; title: string; createdAt: string; shared: boolean };
};

export function SlopRow({ slop }: SlopRowProps) {
  const utils = trpc.useUtils();
  const invalidate = () => utils.slop.list.invalidate();

  const deleteMutation = trpc.slop.delete.useMutation({ onSuccess: invalidate });
  const shareMutation = trpc.slop.setShared.useMutation({
    onSuccess: async (next) => {
      await invalidate();
      if (next.shared) {
        await navigator.clipboard?.writeText(next.url).catch(() => {});
      }
    },
  });

  const busy = shareMutation.isPending || deleteMutation.isPending;

  return (
    <div className="border-surface-800 bg-surface-900/50 hover:border-surface-700 flex items-center gap-4 rounded-xl border px-5 py-4 transition">
      <a
        href={`/view/${slop.id}`}
        target="_blank"
        rel="noreferrer"
        className="text-pagepilot-400 hover:text-pagepilot-300 flex-1 truncate text-sm font-medium transition"
      >
        {slop.title}
      </a>

      {slop.shared ? (
        <span className="shrink-0 rounded bg-amber-950/60 px-2 py-0.5 text-xs text-amber-400">
          public link
        </span>
      ) : (
        <span className="text-surface-600 shrink-0 text-xs">private</span>
      )}

      <span className="text-surface-600 shrink-0 text-xs">
        {new Date(slop.createdAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>

      <button
        onClick={() => shareMutation.mutate({ id: slop.id, shared: !slop.shared })}
        disabled={busy}
        title={
          slop.shared
            ? "Revoke the public link. Anyone holding it loses access."
            : "Create a public link anyone can open, and copy it to the clipboard."
        }
        className="text-surface-400 hover:bg-surface-800 shrink-0 rounded px-2.5 py-1 text-xs transition hover:text-white disabled:opacity-50"
      >
        {shareMutation.isPending ? "..." : slop.shared ? "unshare" : "share"}
      </button>

      <button
        onClick={() => deleteMutation.mutate({ id: slop.id })}
        disabled={busy}
        className="shrink-0 rounded px-2.5 py-1 text-xs text-red-500 transition hover:bg-red-950/50 disabled:opacity-50"
      >
        {deleteMutation.isPending ? "..." : "delete"}
      </button>
    </div>
  );
}
