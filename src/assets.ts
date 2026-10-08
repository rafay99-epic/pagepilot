import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Env } from "./env";
import { objectResponse, publicBase, SECURITY_HEADERS } from "./http";
import { trackUpload } from "./ledger";

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
const ASSET_ID = /^[a-f0-9]{32}$/;
const ASSET_TYPE = /\.(?:png|jpeg|webp|gif|avif)/g;
const ASSET_LINK = /\/a\/([a-f0-9]{32}\.(?:png|jpeg|webp|gif|avif))/g;
const MAX_ASSET_BYTES = 10_000_000;
const UPLOAD_TTL_SECONDS = 600;

const ASSET_HEADERS = {
  ...SECURITY_HEADERS,
  "content-security-policy": "default-src 'none'; sandbox",
  // Revalidated on every load so a deleted image stops showing.
  "cache-control": "private, no-cache",
};

// How the accepted formats open, read as latin1. It catches the wrong file,
// such as an error page saved as shot.png; it is not what keeps a crafted file
// harmless, the response headers are. Any of the five passes, since browsers
// render an image by its bytes, whatever type its name claims.
const IMAGE_START =
  /^(?:\x89PNG\r\n.\n|\xff\xd8\xff|GIF8[79]a|RIFF.{4}WEBP|.{4}ftyp.{0,52}avi[fs])/s;

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
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!IMAGE_START.test(Buffer.from(bytes.subarray(0, 64)).toString("latin1"))) {
    return uploadJson({ error: "Not a PNG, JPEG, WebP, GIF or AVIF image" }, 415);
  }
  const object = await env.PAGES.put(`assets/${name}`, bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: `image/${extension}` },
  });
  if (!object) return uploadJson({ error: "Upload URL already used" }, 409);
  await trackUpload(env, `assets/${name}`);
  return uploadJson({ url: `${publicBase(request, env)}/a/${name}` }, 201);
}

// GET /a/<name>: an uploaded image, readable by anyone holding its link.
export async function serveAsset(
  request: Request,
  env: Env,
  name: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, {
      status: 405,
      headers: { ...ASSET_HEADERS, allow: "GET, HEAD" },
    });
  }
  const object = ASSET_NAME.test(name) ? await env.PAGES.get(`assets/${name}`) : null;
  if (!object) return new Response("Not found", { status: 404, headers: ASSET_HEADERS });
  return objectResponse(request, object, {
    ...ASSET_HEADERS,
    "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
  });
}

// Storage keys of the images a page embeds. Any mention of an image's name
// counts, so a link survives however the HTML escapes its slashes; a stray
// mention only keeps an image longer. Names are found from the extension
// backwards, which stays quick on a page full of hex.
export function assetKeys(html: string): string[] {
  const keys = new Set<string>();
  for (const match of html.matchAll(ASSET_TYPE)) {
    const id = html.slice(Math.max(0, match.index - 32), match.index);
    if (ASSET_ID.test(id)) keys.add(`assets/${id}${match[0]}`);
  }
  return [...keys];
}

// The /a/ images a page links to that are not in the bucket: never uploaded,
// or deleted for want of a page. Empty when the check itself fails.
// ponytail: checks the first 50 links; a page with more gets a partial answer.
export async function missingAssets(bucket: R2Bucket, html: string): Promise<string[]> {
  const links = Array.from(html.matchAll(ASSET_LINK), (match) => match[1] ?? "");
  const names = [...new Set(links)].slice(0, 50);
  const found = await Promise.all(
    names.map((name) => bucket.head(`assets/${name}`)),
  ).catch(() => []);
  return names.filter((_, index) => found[index] === null);
}
