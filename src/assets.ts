import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Env } from "./env";
import { objectResponse, publicBase, SECURITY_HEADERS } from "./http";

// Raster images only. Assets are served from the dashboard's origin, so
// nothing that can run script (SVG, HTML) is accepted.
export const ASSET_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

// `<32 hex id>.<image subtype>`; the extension decides the content type.
const ASSET_NAME = /^[a-f0-9]{32}\.(png|jpeg|webp|gif|avif)$/;
const ASSET_MENTION = /[a-f0-9]{32}\.(?:png|jpeg|webp|gif|avif)/g;
const MAX_ASSET_BYTES = 10_000_000;
const UPLOAD_TTL_SECONDS = 600;

const ASSET_HEADERS = {
  ...SECURITY_HEADERS,
  "content-security-policy": "default-src 'none'; sandbox",
  // Revalidated on every load so a deleted image stops showing.
  "cache-control": "private, no-cache",
};

function sign(apiKey: string, name: string, expires: number): string {
  return createHmac("sha256", apiKey)
    .update(`pagepilot-upload-v1\n${name}\n${expires}`)
    .digest("base64url");
}

function uploadJson(body: { error: string } | { url: string }, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

// Mints a one-use upload URL for an image and the URL it will be served from.
// The signature stands in for the API key, so a shell can upload without it.
export function createUpload(
  apiKey: string,
  base: string,
  type: (typeof ASSET_TYPES)[number],
) {
  const name = `${crypto.randomUUID().replace(/-/g, "")}.${type.slice("image/".length)}`;
  const expires = Math.floor(Date.now() / 1000) + UPLOAD_TTL_SECONDS;
  return {
    uploadUrl: `${base}/api/assets/${name}?expires=${expires}&signature=${sign(apiKey, name, expires)}`,
    assetUrl: `${base}/a/${name}`,
  };
}

// PUT /api/assets/<name>: stores the request body once per signed URL.
export async function handleUpload(
  request: Request,
  env: Env,
  name: string,
): Promise<Response> {
  if (!env.PAGEPILOT_API_KEY) {
    return uploadJson({ error: "API key is not configured" }, 503);
  }
  const url = new URL(request.url);
  const extension = ASSET_NAME.exec(name)?.[1];
  const expires = Number(url.searchParams.get("expires"));
  const supplied = Buffer.from(url.searchParams.get("signature") ?? "");
  const expected = Buffer.from(sign(env.PAGEPILOT_API_KEY, name, expires));
  if (
    !extension ||
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return uploadJson({ error: "Invalid upload URL" }, 403);
  }
  if (expires < Date.now() / 1000) {
    return uploadJson({ error: "Upload URL expired; request a new one" }, 403);
  }
  if (request.method !== "PUT") {
    return new Response(null, {
      status: 405,
      headers: { allow: "PUT", "cache-control": "no-store" },
    });
  }
  const length = Number(request.headers.get("content-length"));
  if (!request.body || !Number.isInteger(length) || length <= 0) {
    return uploadJson({ error: "Send the file with a Content-Length" }, 411);
  }
  if (length > MAX_ASSET_BYTES) {
    return uploadJson({ error: "Image exceeds the 10 MB limit" }, 413);
  }
  const object = await env.PAGES.put(`assets/${name}`, request.body, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: `image/${extension}` },
  });
  if (!object) return uploadJson({ error: "Upload URL already used" }, 409);
  return uploadJson({ url: `${publicBase(request, env)}/a/${name}` }, 201);
}

// GET /a/<name>: an uploaded image, readable by anyone holding its link.
export async function serveAsset(
  request: Request,
  env: Env,
  name: string,
): Promise<Response> {
  if (!ASSET_NAME.test(name)) {
    return new Response("Not found", { status: 404, headers: ASSET_HEADERS });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { ...ASSET_HEADERS, allow: "GET, HEAD" },
    });
  }
  const object = await env.PAGES.get(`assets/${name}`);
  if (!object) return new Response("Not found", { status: 404, headers: ASSET_HEADERS });
  return objectResponse(request, object, {
    ...ASSET_HEADERS,
    "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
  });
}

// Storage keys of the images a page embeds. Any mention of an image's name
// counts, so a link survives however the HTML escapes its slashes; a stray
// mention only keeps an image longer.
export function assetKeys(html: string): string[] {
  return [
    ...new Set(Array.from(html.matchAll(ASSET_MENTION), (match) => `assets/${match[0]}`)),
  ];
}
