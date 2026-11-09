import { Buffer } from "node:buffer";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Env } from "./env";
import { objectResponse, publicBase, SECURITY_HEADERS } from "./http";
import { trackUpload } from "./ledger";

// Raster images and video only. Assets are served from the dashboard's
// origin, so nothing that can run script (SVG, HTML) is accepted.
export const ASSET_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
] as const;

// `<32 hex id>.<subtype>`; the extension decides the content type.
const EXTENSIONS = "png|jpeg|webp|gif|avif|mp4|webm";
const ASSET_NAME = new RegExp(`^[a-f0-9]{32}\\.(${EXTENSIONS})$`);
const ASSET_ID = /^[a-f0-9]{32}$/;
const ASSET_TYPE = new RegExp(`\\.(?:${EXTENSIONS})`, "g");
const ASSET_LINK = new RegExp(`/a/([a-f0-9]{32}\\.(?:${EXTENSIONS}))`, "g");
const UPLOAD_TTL_SECONDS = 600;

// Per kind: the size cap and how the accepted formats open, read as latin1.
// The signature catches the wrong file, such as an error page saved as
// shot.png; it is not what keeps a crafted file harmless, the response
// headers are. Any format of the right kind passes, since browsers play and
// render by the bytes, whatever type the name claims. Video stops at 100 MB,
// the largest request body a Worker on the free plan accepts.
const KINDS = {
  image: {
    maxBytes: 10_000_000,
    tooBig: "Image exceeds the 10 MB limit",
    start:
      /^(?:\x89PNG\r\n.\n|\xff\xd8\xff|GIF8[79]a|RIFF.{4}WEBP|.{4}ftyp.{0,52}avi[fs])/s,
    refused: "Not a PNG, JPEG, WebP, GIF or AVIF image",
  },
  video: {
    maxBytes: 100_000_000,
    tooBig: "Video exceeds the 100 MB limit",
    // An ISO media file that is not an AVIF image, or an EBML (WebM) header.
    // oxlint-disable-next-line no-control-regex
    start: /^(?:.{4}ftyp(?!avi[fs])|\x1a\x45\xdf\xa3)/s,
    refused: "Not an MP4 or WebM video",
  },
};

const ASSET_HEADERS = {
  ...SECURITY_HEADERS,
  "content-security-policy": "default-src 'none'; sandbox",
  // Revalidated on every load so a deleted file stops showing.
  "cache-control": "private, no-cache",
};

// One `bytes=` range, the only form browsers send for media. Anything else,
// multiple ranges included, is ignored and the whole file is sent, which
// RFC 9110 allows. Fifteen digits keeps every number exact.
const RANGE = /^bytes=(\d{0,15})-(\d{0,15})$/;
type ByteRange = { offset: number; length?: number } | { suffix: number };

function parseRange(header: string | null): ByteRange | undefined {
  const [, first = "", last = ""] = RANGE.exec(header?.trim() ?? "") ?? [];
  if (first) {
    const offset = Number(first);
    if (!last) return { offset };
    const end = Number(last);
    return end >= offset ? { offset, length: end - offset + 1 } : undefined;
  }
  return Number(last) > 0 ? { suffix: Number(last) } : undefined;
}

function sign(apiKey: string, name: string, expires: number): string {
  return createHmac("sha256", apiKey)
    .update(`pagepilot-upload-v1\n${name}\n${expires}`)
    .digest("base64url");
}

function uploadJson(body: { error: string } | { url: string }, status: number) {
  return Response.json(body, { status, headers: { "cache-control": "no-store" } });
}

// Mints a one-use upload URL for an image or video and the URL it will be
// served from.
// The signature stands in for the API key, so a shell can upload without it.
export function createUpload(
  apiKey: string,
  base: string,
  type: (typeof ASSET_TYPES)[number],
) {
  const name = `${crypto.randomUUID().replace(/-/g, "")}.${type.slice(type.indexOf("/") + 1)}`;
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
  const kind = extension === "mp4" || extension === "webm" ? "video" : "image";
  const { maxBytes, tooBig, start, refused } = KINDS[kind];
  const length = Number(request.headers.get("content-length"));
  if (!request.body || !Number.isInteger(length) || length <= 0) {
    return uploadJson({ error: "Send the file with a Content-Length" }, 411);
  }
  if (length > maxBytes) return uploadJson({ error: tooBig }, 413);
  // Streamed straight into R2, so a video never sits in the Worker's memory
  // and no script touches its bytes. The start is checked once stored; a
  // wrong file is deleted again, which leaves the upload URL unused. It is
  // handed to the ledger first, so a file left behind by a failed check or
  // delete is still swept a day later.
  const key = `assets/${name}`;
  const object = await env.PAGES.put(key, request.body, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: `${kind}/${extension}` },
  });
  if (!object) return uploadJson({ error: "Upload URL already used" }, 409);
  await trackUpload(env, key);
  const head = await env.PAGES.get(key, { range: { offset: 0, length: 64 } });
  const bytes = head ? Buffer.from(await head.arrayBuffer()) : Buffer.alloc(0);
  if (!start.test(bytes.toString("latin1"))) {
    await env.PAGES.delete(key);
    return uploadJson({ error: refused }, 415);
  }
  return uploadJson({ url: `${publicBase(request, env)}/a/${name}` }, 201);
}

// GET /a/<name>: an uploaded file, readable by anyone holding its link.
// Honours one byte range, which video needs: Safari plays nothing without
// it and every browser needs it to seek. Assets never change once stored,
// so If-Range has nothing to protect and is not checked.
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
  if (!ASSET_NAME.test(name)) return notFound();
  const key = `assets/${name}`;
  const range = parseRange(request.headers.get("range"));
  let object: R2ObjectBody | null;
  try {
    object = await env.PAGES.get(key, range && { range });
  } catch (error) {
    // R2 throws when the range starts past the end of the file.
    const offset = range && "offset" in range ? range.offset : undefined;
    const stored = offset === undefined ? null : await env.PAGES.head(key);
    if (!stored || offset === undefined || offset < stored.size) throw error;
    return unsatisfiable(stored.size);
  }
  if (!object) return notFound();
  const headers = {
    ...ASSET_HEADERS,
    "accept-ranges": "bytes",
    "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
  };
  if (!range) return objectResponse(request, object, headers);
  // R2 clamps a range that runs past the end; the header says what it sent.
  const { size } = object;
  const [first, end] =
    "suffix" in range
      ? [Math.max(size - range.suffix, 0), size]
      : [range.offset, Math.min(range.offset + (range.length ?? size), size)];
  // Should R2 ever send an empty body rather than throw, it is still a 416.
  if (first >= size) {
    await object.body.cancel();
    return unsatisfiable(size);
  }
  return objectResponse(
    request,
    object,
    { ...headers, "content-range": `bytes ${first}-${end - 1}/${size}` },
    206,
  );
}

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: ASSET_HEADERS });
}

function unsatisfiable(size: number): Response {
  return new Response(null, {
    status: 416,
    headers: {
      ...ASSET_HEADERS,
      "accept-ranges": "bytes",
      "content-range": `bytes */${size}`,
    },
  });
}

// Storage keys of the uploads a page embeds. Any mention of a file's name
// counts, so a link survives however the HTML escapes its slashes; a stray
// mention only keeps a file longer. Names are found from the extension
// backwards, which stays quick on a page full of hex.
export function assetKeys(html: string): string[] {
  const keys = new Set<string>();
  for (const match of html.matchAll(ASSET_TYPE)) {
    const id = html.slice(Math.max(0, match.index - 32), match.index);
    if (ASSET_ID.test(id)) keys.add(`assets/${id}${match[0]}`);
  }
  return [...keys];
}

// The /a/ uploads a page links to that are not in the bucket: never uploaded,
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
