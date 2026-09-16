import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { SiteShell } from "@/components/site-shell";
import { AuthNav } from "@/components/auth-nav";

/**
 * Authed chrome: Clerk JS loads only here — dashboard, storage and the sign-in
 * and sign-up flows that render Clerk components. Public pages never mount
 * this provider, so they never pay for it.
 */
export default function ClerkLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider appearance={{ theme: shadcn }}>
      <SiteShell nav={<AuthNav />}>{children}</SiteShell>
    </ClerkProvider>
  );
}
