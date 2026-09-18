import { PAGE_ID } from "../shared/api";
import { authorizeOwner } from "./access";
import type { Env } from "./env";
import { dashboardJson } from "./http";
import { findPage, listPages, publicBase } from "./pages";
import { servePage } from "./serve-page";
import { storageReport } from "./storage";

// Everything under /dashboard and /api/dashboard: owner-only, no-store, and
// same-origin for anything that changes state.
export async function handleDashboard(request: Request, env: Env): Promise<Response> {
  const denied = await authorizeOwner(request, env);
  if (denied) return denied;
  const url = new URL(request.url);
  if (
    !["GET", "HEAD", "OPTIONS"].includes(request.method) &&
    request.headers.get("origin") !== url.origin
  ) {
    return dashboardJson({ error: "Origin not allowed" }, 403);
  }
  try {
    if (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/")) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return dashboardJson({ error: "Method not allowed" }, 405);
      }
      if (!env.ASSETS)
        return dashboardJson({ error: "Dashboard assets unavailable" }, 503);
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set("cache-control", "no-store");
      response.headers.set("referrer-policy", "no-referrer");
      response.headers.set("x-content-type-options", "nosniff");
      response.headers.set("x-robots-tag", "noindex, nofollow");
      response.headers.set(
        "content-security-policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      );
      return response;
    }
    if (url.pathname === "/api/dashboard/pages") {
      if (request.method !== "GET") {
        return dashboardJson({ error: "Method not allowed" }, 405);
      }
      const cursor = url.searchParams.get("cursor") ?? undefined;
      if (cursor && cursor.length > 4096) {
        return dashboardJson({ error: "Invalid cursor" }, 400);
      }
      return dashboardJson(await listPages(env.PAGES, publicBase(request, env), cursor));
    }
    if (url.pathname === "/api/dashboard/storage") {
      if (request.method !== "GET") {
        return dashboardJson({ error: "Method not allowed" }, 405);
      }
      return dashboardJson(await storageReport(env.PAGES, publicBase(request, env)));
    }
    const preview = /^\/api\/dashboard\/pages\/([^/]+)\/preview$/.exec(url.pathname);
    if (preview?.[1]) return await servePage(request, env, preview[1], "'self'");
    if (url.pathname.startsWith("/api/dashboard/pages/")) {
      if (request.method !== "DELETE") {
        return dashboardJson({ error: "Method not allowed" }, 405);
      }
      const id = url.pathname.slice("/api/dashboard/pages/".length);
      if (!PAGE_ID.test(id)) return dashboardJson({ error: "Invalid page id" }, 400);
      const object = await findPage(env.PAGES, id, (key) => env.PAGES.head(key));
      if (!object) return dashboardJson({ error: "Page not found" }, 404);
      await env.PAGES.delete(object.key);
      return dashboardJson({ id, deleted: true });
    }
    return dashboardJson({ error: "Not found" }, 404);
  } catch {
    return dashboardJson({ error: "Request failed; retry later" }, 500);
  }
}
