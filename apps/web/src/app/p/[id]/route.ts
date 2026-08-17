import { NextResponse } from "next/server";
import { getPageStream } from "@pagepilot/core/r2";

/**
 * A published page is immutable bytes at an unguessable URL, so the CDN can
 * hold it: the cache key is the URL and the URL is the capability. Serving
 * every view from the origin meant a function invocation, an R2 round trip and
 * a full copy of the HTML for each refresh, reload and link unfurl.
 *
 * `Vercel-CDN-Cache-Control` is stripped before the response leaves the edge,
 * so browsers keep revalidating while the edge absorbs the repeats.
 */
const CACHE_SECONDS = 60;

/**
 * Deliberately unauthenticated: the 48-bit id in the URL is the capability.
 * Anyone holding a link can read that page, so treat links as the secret.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await getPageStream(id);

  // Never cached: an id that misses today is an id that may exist in a moment.
  if (!body) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  }

  return new NextResponse(body, {
    headers: {
      "content-type": "text/html;charset=utf-8",
      // Links leak by being forwarded and unfurled; they should still never
      // turn up in a search index.
      "x-robots-tag": "noindex, nofollow, noarchive",
      "cache-control": "public, max-age=0, must-revalidate",
      "vercel-cdn-cache-control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=300`,
      "content-security-policy": [
        "sandbox allow-scripts allow-popups",
        "default-src 'none'",
        "script-src 'unsafe-inline' https:",
        "style-src 'unsafe-inline' https:",
        "img-src data: blob: https:",
        "font-src data: https:",
        "connect-src https:",
        "media-src blob: https:",
        "frame-src https:",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; "),
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
