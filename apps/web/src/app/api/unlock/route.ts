import { NextResponse } from "next/server";
import { isValidKey, SESSION_COOKIE } from "@pagepilot/core/auth";

/** Trades the API key for an httpOnly cookie so the browser can read private pages. */
export async function POST(request: Request) {
  const { key } = (await request.json().catch(() => ({}))) as { key?: string };

  if (!isValidKey(key ?? "")) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, key!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
