"use client";

import { SignInButton, SignUpButton, UserButton, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Clerk's `<Show>` is a server component that awaits `auth()`, and having it in
 * the root layout made every route in the app dynamic — the landing page and
 * the docs included, so neither could be served from the CDN. Resolving the
 * session in the browser instead keeps those two fully static.
 */
export function AuthNav() {
  const { isLoaded, isSignedIn } = useAuth();

  // Nothing rather than a wrong guess: rendering "Sign in" to a signed-in user
  // for a frame is a worse flicker than the nav arriving a beat late.
  if (!isLoaded) return null;

  if (isSignedIn) {
    return (
      <>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard">Dashboard</Link>
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/storage">Storage</Link>
        </Button>
        <UserButton />
      </>
    );
  }

  return (
    <>
      <SignInButton mode="modal" forceRedirectUrl="/dashboard">
        <Button variant="ghost" size="sm">
          Sign in
        </Button>
      </SignInButton>
      <SignUpButton mode="modal" forceRedirectUrl="/dashboard">
        <Button size="sm">Sign up</Button>
      </SignUpButton>
    </>
  );
}
