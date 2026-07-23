"use client";

import { trpc } from "@/trpc/client";

type SlopRowProps = {
  slop: { id: string; title: string; createdAt: string };
};

export function SlopRow({ slop }: SlopRowProps) {
  const utils = trpc.useUtils();
  const deleteMutation = trpc.slop.delete.useMutation({
    onSuccess: () => utils.slop.list.invalidate(),
  });

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
      <span className="text-surface-600 shrink-0 text-xs">
        {new Date(slop.createdAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
      <a
        href={`/view/${slop.id}`}
        target="_blank"
        rel="noreferrer"
        className="text-surface-400 hover:bg-surface-800 shrink-0 rounded px-2.5 py-1 text-xs transition hover:text-white"
      >
        view
      </a>
      <button
        onClick={() => deleteMutation.mutate({ id: slop.id })}
        disabled={deleteMutation.isPending}
        className="shrink-0 rounded px-2.5 py-1 text-xs text-red-500 transition hover:bg-red-950/50 disabled:opacity-50"
      >
        {deleteMutation.isPending ? "..." : "delete"}
      </button>
    </div>
  );
}
