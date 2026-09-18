import { Buffer } from "node:buffer";
import type { Page, PageList } from "../shared/api";
import type { Env } from "./env";

// Stored keys are `pages/<id>.html`. Uploads from older versions appended the
// base64url title to the id, which the second group captures.
const PAGE_KEY = /^pages\/([a-f0-9]{12}|[a-f0-9]{32})(?:~([A-Za-z0-9_-]*))?\.html$/;

// Only 12-character ids were ever written with a title in the key, so anything
// longer skips the list call.
export async function legacyKey(
  bucket: R2Bucket,
  id: string,
): Promise<string | undefined> {
  if (id.length !== 12) return undefined;
  const listing = await bucket.list({ prefix: `pages/${id}~`, limit: 1 });
  const key = listing.objects[0]?.key;
  return key && PAGE_KEY.test(key) ? key : undefined;
}

// Public record for one stored object, or null when the key is not a page key.
export function pageRecord(object: R2Object, base: string): Page | null {
  const match = PAGE_KEY.exec(object.key);
  if (!match?.[1]) return null;
  const id = match[1];
  const encoded = match[2];
  let title = object.customMetadata?.["title"] || id;
  if (encoded) {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    title = Buffer.from(decoded).toString("base64url") === encoded ? decoded : encoded;
  }
  return { id, title, url: `${base}/p/${id}`, createdAt: object.uploaded.toISOString() };
}

// Canonical origin for public links; the request origin is only a fallback.
export function publicBase(request: Request, env: Env): string {
  return env.PUBLIC_URL?.replace(/\/+$/, "") || new URL(request.url).origin;
}

// One page of the listing, in object-key order.
export async function listPages(
  bucket: R2Bucket,
  base: string,
  cursor?: string,
): Promise<PageList> {
  const listing = await bucket.list({
    prefix: "pages/",
    limit: 100,
    include: ["customMetadata"],
    ...(cursor ? { cursor } : {}),
  });
  const items = listing.objects.flatMap((object) => {
    const record = pageRecord(object, base);
    return record ? [record] : [];
  });
  return { items, ...(listing.truncated ? { nextCursor: listing.cursor } : {}) };
}

// Looks up `pages/<id>.html` and falls back to the legacy title-in-key object.
// Pass `bucket.get` to read the body, `bucket.head` for metadata only.
export async function findPage<T extends R2Object>(
  bucket: R2Bucket,
  id: string,
  read: (key: string) => Promise<T | null>,
): Promise<T | null> {
  const direct = await read(`pages/${id}.html`);
  if (direct) return direct;
  const legacy = await legacyKey(bucket, id);
  return legacy ? await read(legacy) : null;
}
