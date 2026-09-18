import { PAGE_ID } from "../shared/api";
import type { Env } from "./env";
import { pageCsp, SECURITY_HEADERS } from "./http";
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
  const headers = {
    ...SECURITY_HEADERS,
    "content-security-policy": pageCsp(frameAncestors),
    "content-type": "text/html; charset=utf-8",
    etag: object.httpEtag,
  };
  const condition = request.headers.get("if-none-match");
  const matches = condition?.split(",").some((tag) => {
    const normalized = tag.trim().replace(/^W\//, "");
    return normalized === "*" || normalized === object.httpEtag;
  });
  if (matches || request.method === "HEAD") {
    await object.body.cancel();
    return new Response(null, { status: matches ? 304 : 200, headers });
  }
  return new Response(object.body, { headers });
}
