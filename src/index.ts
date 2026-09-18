import { handleDashboard } from "./dashboard";
import type { Env } from "./env";
import { errorResponse, LANDING_HEADERS, SECURITY_HEADERS } from "./http";
import landing from "./landing.html";
import { handleMcp } from "./mcp";
import { servePage } from "./serve-page";

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/mcp") return await handleMcp(request, env);
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        (url.pathname === "/dashboard" || url.pathname.startsWith("/dashboard/"))
      ) {
        return await handleDashboard(request, env);
      }
      if (url.pathname.startsWith("/api/dashboard/")) {
        return await handleDashboard(request, env);
      }
      if (url.pathname.startsWith("/p/")) {
        return await servePage(request, env, url.pathname.slice(3));
      }
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        url.pathname === "/"
      ) {
        return new Response(request.method === "HEAD" ? null : landing, {
          headers: LANDING_HEADERS,
        });
      }
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        url.pathname === "/health"
      ) {
        return new Response(request.method === "HEAD" ? null : "ok", {
          headers: { "content-type": "text/plain", "cache-control": "no-store" },
        });
      }
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        url.pathname === "/robots.txt"
      ) {
        return new Response(
          request.method === "HEAD" ? null : "User-agent: *\nDisallow: /\n",
          {
            headers: { "content-type": "text/plain" },
          },
        );
      }
      return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
    } catch {
      return errorResponse(500, "Request failed; retry later");
    }
  },
} satisfies ExportedHandler<Env>;
