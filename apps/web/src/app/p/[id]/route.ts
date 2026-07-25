import { NextResponse } from "next/server";
import { getPageHtml } from "@pagepilot/core/r2";

/**
 * Deliberately unauthenticated: the 48-bit id in the URL is the capability.
 * Anyone holding a link can read that page, so treat links as the secret.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const html = await getPageHtml(id);

  if (!html) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(html, {
    headers: {
      "content-type": "text/html;charset=utf-8",
      // Links leak by being forwarded and unfurled; they should still never
      // turn up in a search index.
      "x-robots-tag": "noindex, nofollow, noarchive",
      "cache-control": "private, no-store",
    },
  });
}
