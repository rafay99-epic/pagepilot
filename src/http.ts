import type { DashboardBody } from "../shared/api";
import type { Env } from "./env";

// Every value JSON.parse can produce.
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// Policy for stored pages. Public links refuse framing; the owner preview
// route passes 'self' so only the dashboard can embed a page. `origin` lets a
// page load its uploaded images and video when the Worker runs on plain HTTP
// locally.
export function pageCsp(frameAncestors: "'none'" | "'self'", origin = ""): string {
  return [
    "sandbox allow-scripts allow-popups",
    "default-src 'none'",
    "script-src 'unsafe-inline' https:",
    "style-src 'unsafe-inline' https:",
    `img-src data: blob: https: ${origin}`.trim(),
    "font-src data: https:",
    "connect-src https:",
    `media-src blob: https: ${origin}`.trim(),
    "frame-src https:",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}

export const SECURITY_HEADERS = {
  "x-robots-tag": "noindex, nofollow, noarchive",
  "content-security-policy": pageCsp("'none'"),
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "cache-control": "private, no-store",
};

// The landing page is public and static, so it may be cached. It runs no
// script and loads nothing, so everything except inline styles is denied.
export const LANDING_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "public, max-age=300",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

// Canonical origin for public links; the request origin is only a fallback.
export function publicBase(request: Request, env: Env): string {
  return env.PUBLIC_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
}

// Answers GET or HEAD for a stored object and honours If-None-Match. `status`
// is 206 when the object is a byte range of the stored file. A 304 carries no
// Content-Range, since it describes no body (RFC 9110, 15.4.5).
export async function objectResponse(
  request: Request,
  object: R2ObjectBody,
  headers: Record<string, string>,
  status: 200 | 206 = 200,
): Promise<Response> {
  const withEtag = { ...headers, etag: object.httpEtag };
  const matches = request.headers
    .get("if-none-match")
    ?.split(",")
    .some((tag) => {
      const normalized = tag.trim().replace(/^W\//, "");
      return normalized === "*" || normalized === object.httpEtag;
    });
  if (matches || request.method === "HEAD") {
    await object.body.cancel();
    const response = new Response(null, {
      status: matches ? 304 : status,
      headers: withEtag,
    });
    if (matches) response.headers.delete("content-range");
    return response;
  }
  return new Response(object.body, { status, headers: withEtag });
}

// Dashboard and dashboard API responses; every shape is part of the contract
// in shared/api.ts, which the dashboard parses with the matching schema.
export function dashboardJson(body: DashboardBody, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

// JSON-RPC shaped error, used by the MCP endpoint and the router's catch-all.
export function errorResponse(status: number, message: string): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code: -32000, message }, id: null },
    {
      status,
      headers: {
        "cache-control": "no-store",
        ...(status === 401 ? { "www-authenticate": "Bearer" } : {}),
      },
    },
  );
}
