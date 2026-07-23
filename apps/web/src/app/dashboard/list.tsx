"use client";

import { trpc } from "@/trpc/client";
import { useMemo, useCallback } from "react";
import { SlopRow } from "./slop-row";

const PAGE_SIZE = 25;

export default function DashboardList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, error } =
    trpc.slop.list.useInfiniteQuery(
      { limit: PAGE_SIZE },
      {
        getNextPageParam: (lastPage) => lastPage.nextCursor,
      },
    );

  const pages = data?.pages.flatMap((p) => p.items) ?? [];

  const observer = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const setSentinel = useCallback(
    (node: HTMLDivElement | null) => {
      if (observer) {
        observer.disconnect();
        if (node) observer.observe(node);
      }
    },
    [observer],
  );

  if (isLoading) {
    return (
      <div className="py-12">
        <Header />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="border-surface-800 bg-surface-900/50 h-16 animate-pulse rounded-xl border"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12">
        <Header />
        <div className="border-red-900/50 bg-red-950/20 rounded-xl border p-8 text-center">
          <p className="text-red-400">Failed to load pages</p>
          <p className="text-red-600 mt-1 text-sm">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12">
      <Header />

      {pages.length === 0 && (
        <div className="border-surface-800 bg-surface-900/50 rounded-xl border p-8 text-center">
          <p className="text-surface-400">No pages deployed yet.</p>
          <p className="text-surface-600 mt-1 text-sm">
            Tell your AI agent to build something — it will use the MCP server to deploy
            here.
          </p>
        </div>
      )}

      {pages.length > 0 && (
        <div className="space-y-2">
          {pages.map((s) => (
            <SlopRow key={s.id} slop={s} />
          ))}

          <div ref={setSentinel} className="h-4" />

          {isFetchingNextPage && (
            <div className="border-surface-800 bg-surface-900/50 h-16 animate-pulse rounded-xl border" />
          )}

          {!hasNextPage && pages.length > PAGE_SIZE && (
            <p className="text-surface-600 pt-4 text-center text-xs">
              All {pages.length} pages loaded.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="mb-10">
      <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
      <p className="text-surface-500 mt-1 text-sm">
        View and manage your deployed HTML pages.
      </p>
    </header>
  );
}
