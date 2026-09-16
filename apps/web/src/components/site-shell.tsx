import Link from "next/link";
import { site } from "@/lib/site";
import { Logo, LogoMark } from "@/components/logo";

/**
 * The shared site chrome. Which nav it renders decides who loads Clerk JS:
 * the public pages pass plain links and ship none, the authed pages pass
 * AuthNav and get the full session UI.
 */
export function SiteShell({
  nav,
  children,
}: {
  nav: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="border-border/60 bg-background/70 sticky top-0 z-50 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label={`${site.name} home`}>
            <Logo />
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">{nav}</nav>
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
    </>
  );
}
