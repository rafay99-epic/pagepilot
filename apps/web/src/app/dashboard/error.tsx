"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-12">
      <header className="mb-10">
        <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
      </header>
      <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-8 text-center">
        <p className="text-red-400">Something went wrong loading your pages.</p>
        <p className="mb-4 mt-1 text-sm text-red-600">{error.message}</p>
        <button
          onClick={reset}
          className="bg-pagepilot-600 hover:bg-pagepilot-500 rounded-lg px-4 py-2 text-sm font-medium text-white transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
