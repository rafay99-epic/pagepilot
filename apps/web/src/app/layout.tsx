import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { cn } from "@/lib/utils";
import { site } from "@/lib/site";
import { GithubIcon, Logo, LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

const title = `${site.name} — Private HTML Vault for AI Agents`;

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: title, template: `%s — ${site.name}` },
  description: site.description,
  applicationName: site.name,
  keywords: [
    "MCP server",
    "Model Context Protocol",
    "AI agent hosting",
    "deploy HTML",
    "Claude Code MCP",
    "Cloudflare R2",
    "static page hosting",
    "PagePilot",
  ],
  authors: [{ name: "Abdul Rafay", url: site.repo }],
  creator: "Abdul Rafay",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: site.name,
    url: site.url,
    title,
    description: site.description,
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", title, description: site.description },
  robots: { index: true, follow: true },
  category: "technology",
};

export const viewport: Viewport = { themeColor: "#0b0b12", colorScheme: "dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark", geist.variable, geistMono.variable)}>
      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        <header className="border-border/60 bg-background/70 sticky top-0 z-50 border-b backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <Link href="/" aria-label={`${site.name} home`}>
              <Logo />
            </Link>
            <nav className="flex items-center gap-1 sm:gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/docs">Docs</Link>
              </Button>
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex" asChild>
                <Link href="/docs#run-your-own">Self-host</Link>
              </Button>
              <Button size="sm" asChild>
                <a href={site.repo} target="_blank" rel="noreferrer noopener">
                  <GithubIcon />
                  GitHub
                </a>
              </Button>
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">{children}</main>

        <footer className="border-border/60 mt-24 border-t">
          <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 text-sm sm:flex-row sm:px-6 lg:px-8">
            <span className="flex items-center gap-2">
              <LogoMark className="size-5" radius={6} />
              {site.name} — a private HTML vault for AI agents
            </span>
            <span className="flex items-center gap-5">
              <Link href="/docs" className="hover:text-foreground transition">
                Docs
              </Link>
              <a
                href={site.repo}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-foreground transition"
              >
                GitHub
              </a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
