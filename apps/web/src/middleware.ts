import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isAuthed, unauthorized } from "@pagepilot/core/auth";

const clerk = clerkMiddleware();

const MCP_PATH = "/api/mcp";

/**
 * `/api/mcp` is a public URL and gets scanned like one. Its bearer check used to
 * live only in the route, so every probe woke the Node function, loaded the MCP
 * SDK and zod, and billed the invocation to answer 401. Rejecting here settles
 * it in the edge runtime instead. Clerk never sees the path: the MCP endpoint
 * authenticates with a key, not a session.
 */
export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (request.nextUrl.pathname === MCP_PATH) {
    return isAuthed(request) ? NextResponse.next() : unauthorized();
  }
  return clerk(request, event);
}

/**
 * Only `/api/mcp` and the routes that actually call `auth()`. Middleware is a
 * function invocation on every matched request, so a broad matcher put Clerk's
 * cookie and JWT work in front of `/`, `/docs` and `/p/<id>` — none of which use
 * Clerk sessions, and the first two of which are static and served from the CDN.
 */
export const config = {
  matcher: [
    "/api/mcp",
    "/dashboard/:path*",
    "/storage/:path*",
    "/sign-in/:path*",
    "/sign-up/:path*",
    "/__clerk/:path*",
  ],
};
