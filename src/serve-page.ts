import { PAGE_ID } from "../shared/api";
import type { Env } from "./env";
import { objectResponse, pageCsp, SECURITY_HEADERS } from "./http";
import { findPage } from "./pages";

// Serves a stored page. Public links refuse framing; the dashboard preview
// passes 'self' so only the dashboard can embed the page.
export async function servePage(
  request: Request,
  env: Env,
  id: string,
  frameAncestors: "'none'" | "'self'" = "'none'",
): Promise<Response> {
  if (!PAGE_ID.test(id))
    return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { ...SECURITY_HEADERS, allow: "GET, HEAD" },
    });
  }
  const object = await findPage(env.PAGES, id, (key) => env.PAGES.get(key));
  if (!object)
    return new Response("Not found", { status: 404, headers: SECURITY_HEADERS });
  return objectResponse(request, object, {
    ...SECURITY_HEADERS,
    "content-security-policy": pageCsp(frameAncestors, new URL(request.url).origin),
    "content-type": "text/html; charset=utf-8",
  });
}
