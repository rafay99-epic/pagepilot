import { NextResponse } from "next/server";
import { isValidKey, SESSION_COOKIE } from "@pagepilot/core/auth";

/**
 * Trades the API key for an httpOnly cookie so a browser can read private pages.
 * Accepts a plain HTML form post (and redirects) or JSON, so /unlock needs no
 * client-side JavaScript at all.
 */
export async function POST(request: Request) {
  const type = request.headers.get("content-type") || "";
  const isForm = type.includes("form");

  let key = "";
  if (isForm) {
    key = String((await request.formData()).get("key") ?? "");
  } else {
    key = String(
      ((await request.json().catch(() => ({}))) as { key?: string }).key ?? "",
    );
  }

  if (!isValidKey(key)) {
    return isForm
      ? NextResponse.redirect(new URL("/unlock?bad=1", request.url), 303)
      : NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = isForm
    ? NextResponse.redirect(new URL("/unlock?ok=1", request.url), 303)
    : NextResponse.json({ ok: true });

  res.cookies.set(SESSION_COOKIE, key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

/** Sign out of this browser. */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
