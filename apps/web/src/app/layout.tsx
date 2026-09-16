import { Geist, Geist_Mono } from "next/font/google";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

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

/**
 * Shell-free on purpose: each route group brings its own chrome, and which one
 * a page gets decides whether Clerk JS loads there at all.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark", geist.variable, geistMono.variable)}>
      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
