import { Buffer } from "node:buffer";
import { z } from "zod";
import { PAGE_ID } from "../shared/api";
import type { Page } from "../shared/api";
import type { Env } from "./env";
import { forgetPage } from "./ledger";

// Stored keys are `pages/<id>.html`. Uploads from older versions appended the
// base64url title to the id, which the second group captures.
const PAGE_KEY = /^pages\/([a-f0-9]{12}|[a-f0-9]{32})(?:~([A-Za-z0-9_-]*))?\.html$/;

// ponytail: one scan is at most 200 list calls; past that it reports itself
// incomplete rather than getting slower. A call asks for 1,000 objects, but R2
// may return fewer when it includes metadata (local R2 returns 100), so the
// ceiling is 20,000 objects at the least. Upgrade path when a bucket outgrows
// it: keep a date-sorted index in the ledger, written with each page.
const MAX_LIST_CALLS = 200;

// Every object under a prefix, up to the scan ceiling.
export async function listAll(
  bucket: R2Bucket,
  prefix?: string,
): Promise<{ objects: R2Object[]; complete: boolean }> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  for (let call = 0; call < MAX_LIST_CALLS; call++) {
    const listing = await bucket.list({
      limit: 1000,
      include: ["customMetadata"],
      ...(prefix ? { prefix } : {}),
      ...(cursor ? { cursor } : {}),
    });
    objects.push(...listing.objects);
    if (!listing.truncated) return { objects, complete: true };
    cursor = listing.cursor;
  }
  return { objects, complete: false };
}

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
// R2 resets `uploaded` on every overwrite, so an updated page carries its
// first publish time in metadata; until then `uploaded` is both timestamps.
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
  const updatedAt = object.uploaded.toISOString();
  const published = Date.parse(object.customMetadata?.["createdAt"] ?? "");
  return {
    id,
    title,
    url: `${base}/p/${id}`,
    createdAt: Number.isNaN(published) ? updatedAt : new Date(published).toISOString(),
    updatedAt,
    bytes: object.size,
  };
}

type Position = Pick<Page, "updatedAt" | "id">;

// Newest update first; the id breaks ties so paging is stable.
function newestFirst(a: Position, b: Position): number {
  return b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id);
}

// Every page, newest update first. R2 cannot sort or filter by time and ids
// are random, so any ordering needs the full set.
export async function scanPages(
  bucket: R2Bucket,
  base: string,
): Promise<{ pages: Page[]; complete: boolean }> {
  const { objects, complete } = await listAll(bucket, "pages/");
  // An interrupted legacy move leaves two objects for one id. The current key
  // sorts first, so that is the one listed.
  const seen = new Set<string>();
  const pages = objects.flatMap((object) => {
    const record = pageRecord(object, base);
    if (!record || seen.has(record.id)) return [];
    seen.add(record.id);
    return [record];
  });
  return { pages: pages.sort(newestFirst), complete };
}

// What list_pages accepts. `after` and `before` bound updatedAt; the cursor
// names the last page already returned.
export const pageFilter = z.object({
  after: z.string().datetime({ offset: true }).optional(),
  before: z.string().datetime({ offset: true }).optional(),
  query: z.string().max(120).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().max(512).optional(),
});

// One page of the listing for agents. Throws on a bad cursor.
export async function listPages(
  bucket: R2Bucket,
  base: string,
  filter: z.infer<typeof pageFilter>,
) {
  const { pages, complete } = await scanPages(bucket, base);
  const after = filter.after ? Date.parse(filter.after) : -Infinity;
  const before = filter.before ? Date.parse(filter.before) : Infinity;
  const query = filter.query?.trim().toLowerCase();
  let from: Position | undefined;
  if (filter.cursor) {
    const [updatedAt, id] = Buffer.from(filter.cursor, "base64url")
      .toString("utf8")
      .split("|");
    // Only the exact timestamp a cursor was built from sorts where it should.
    // toISOString throws on anything that is not a date at all.
    const exact = !!updatedAt && new Date(updatedAt).toISOString() === updatedAt;
    if (!exact || !id || !PAGE_ID.test(id)) throw new Error("Invalid cursor");
    from = { updatedAt, id };
  }
  const matches = pages.filter((page) => {
    const updated = Date.parse(page.updatedAt);
    return (
      updated >= after &&
      updated < before &&
      (!query || `${page.title} ${page.id}`.toLowerCase().includes(query)) &&
      (!from || newestFirst(from, page) < 0)
    );
  });
  const items = matches.slice(0, filter.limit);
  const last = items.at(-1);
  return {
    items,
    ...(last && matches.length > items.length
      ? { nextCursor: Buffer.from(`${last.updatedAt}|${last.id}`).toString("base64url") }
      : {}),
    ...(complete ? {} : { complete: false }),
  };
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

// Deletes a page: its object under either key format, the version its last
// update replaced, and what the ledger knows about it. Images only this page
// embedded follow a day later.
export async function removePage(env: Env, id: string): Promise<void> {
  const legacy = await legacyKey(env.PAGES, id);
  const keys = [`pages/${id}.html`, `previous/${id}.html`];
  await env.PAGES.delete(legacy ? [...keys, legacy] : keys);
  await forgetPage(env, id);
}
