"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0b0b12] text-white">
        <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-3 text-sm text-zinc-400">
            The request failed unexpectedly. Please try again.
          </p>
          <button
            onClick={reset}
            className="mt-6 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
