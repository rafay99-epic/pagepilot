import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

/**
 * Only the routes that actually call `auth()`. Middleware is a function
 * invocation on every matched request, so a broad matcher put Clerk's cookie
 * and JWT work in front of `/`, `/docs`, `/p/<id>` and `/api/mcp` — none of
 * which use Clerk sessions, and the first two of which are static and can now
 * be served straight from the CDN. `/api/mcp` authenticates with a bearer key.
 */
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/storage/:path*",
    "/sign-in/:path*",
    "/sign-up/:path*",
    "/__clerk/:path*",
  ],
};
