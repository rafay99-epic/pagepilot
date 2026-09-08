import { NextResponse } from "next/server";
import { getPageStream } from "@pagepilot/core/r2";

/**
 * A published page is immutable bytes at an unguessable URL, so the CDN can
 * hold it: the cache key is the URL and the URL is the capability. Serving
 * every view from the origin meant a function invocation, an R2 round trip and
 * a full copy of the HTML for each refresh, reload and link unfurl.
 *
 * `Vercel-CDN-Cache-Control` is stripped before the response leaves the edge,
 * so the browser and the edge get their own budgets from the one number below.
 * Deleting a page therefore takes up to two of these windows to go dark, once
 * for each hop, which is the price of not paying for every reload.
 */
const CACHE_SECONDS = 60;

const SECURITY_HEADERS = {
  // Links leak by being forwarded and unfurled; they should still never
  // turn up in a search index.
  "x-robots-tag": "noindex, nofollow, noarchive",
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
} as const;

/**
 * `max-age=0` meant the browser re-fetched on every reload, back-navigation and
 * tab restore, and a streamed body carries no ETag, so none of those could be
 * answered with a 304. Both halves are fixed here: the browser may reuse its
 * copy for the window, and R2's ETag lets the edge and the browser revalidate
 * without moving the page again.
 */
function cacheHeaders(etag?: string): Record<string, string> {
  return {
    "cache-control": `public, max-age=${CACHE_SECONDS}, must-revalidate`,
    "vercel-cdn-cache-control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=300`,
    ...(etag ? { etag } : {}),
  };
}

/**
 * `If-None-Match` is a list, and both sides need the same normalising: R2 hands
 * back a weak tag (`W/"<md5>"`), and a proxy may weaken or unweaken it again on
 * the way through. RFC 9110 says this comparison is weak anyway, so drop the
 * marker on both sides before matching.
 */
function matches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  const strip = (tag: string) => tag.trim().replace(/^W\//, "");
  const want = strip(etag);
  return ifNoneMatch.split(",").some((tag) => strip(tag) === want);
}

/**
 * Deliberately unauthenticated: the 48-bit id in the URL is the capability.
 * Anyone holding a link can read that page, so treat links as the secret.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const page = await getPageStream(id);

  // Never cached: an id that misses today is an id that may exist in a moment.
  if (!page) {
    return new NextResponse("Not found", {
      status: 404,
      headers: { "cache-control": "private, no-store" },
    });
  }

  if (page.etag && matches(request.headers.get("if-none-match"), page.etag)) {
    // The R2 body is already open, so release it rather than leaving the socket
    // held. Not awaited: under Next's patched fetch that promise never settles,
    // and the 304 has nothing to wait for.
    void page.body.cancel().catch(() => {});
    return new NextResponse(null, { status: 304, headers: cacheHeaders(page.etag) });
  }

  return new NextResponse(page.body, {
    headers: {
      "content-type": "text/html;charset=utf-8",
      ...cacheHeaders(page.etag),
      ...SECURITY_HEADERS,
    },
  });
}
