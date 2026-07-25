import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PagePilot — Private HTML Vault for AI Agents",
  description:
    "Deploy HTML pages from any AI agent via MCP. Stored in Cloudflare R2, served on Vercel.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface-950 text-surface-200 min-h-screen font-sans antialiased">
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 sm:px-6 lg:px-8">
          <header className="flex items-center justify-between py-6">
            <a href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white">
                PagePilot
              </span>
            </a>
            <nav className="flex items-center gap-6 text-sm">
              <a href="/docs" className="text-surface-400 transition hover:text-white">
                Docs
              </a>
              <a
                href="https://github.com/rafay99-epic/pagepilot"
                className="bg-pagepilot-600 hover:bg-pagepilot-500 rounded-lg px-4 py-2 text-sm font-medium text-white transition"
              >
                GitHub
              </a>
            </nav>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-surface-800 text-surface-600 border-t py-8 text-center text-sm">
            PagePilot &mdash; private HTML vault for AI agents &mdash;{" "}
            <a
              href="https://github.com/rafay99-epic/pagepilot"
              className="text-surface-400 transition hover:text-white"
            >
              GitHub
            </a>
          </footer>
        </div>
      </body>
    </html>
  );
}
