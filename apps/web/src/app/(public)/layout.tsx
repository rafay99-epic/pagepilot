import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { Button } from "@/components/ui/button";

/**
 * Public chrome with no Clerk anywhere: landing and docs stay fully static on
 * the CDN and logged-out visitors download zero Clerk JS. The plain sign-in
 * links hand off to the real flows; an already-authed user who clicks one
 * lands in the dashboard via Clerk's redirect.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell
      nav={
        <>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/docs">Docs</Link>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/sign-up">Sign up</Link>
          </Button>
        </>
      }
    >
      {children}
    </SiteShell>
  );
}
