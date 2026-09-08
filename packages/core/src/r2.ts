import { AwsClient } from "aws4fetch";

export type PageRecord = {
  id: string;
  title: string;
  createdAt: string;
};

const PREFIX = "pages/";
const MAX_HTML_BYTES = 900_000;

type R2 = { aws: AwsClient; base: string; bucket: string };

let cachedClient: R2 | undefined;

export function getClient(): R2 {
  cachedClient ??= createClient();
  return cachedClient;
}

/**
 * `aws4fetch` instead of `@aws-sdk/client-s3`: R2 speaks plain SigV4 over HTTP
 * and the six calls below are one request each, so the SDK bought nothing but a
 * multi-megabyte module init charged to every cold start as billable CPU.
 */
function createClient(): R2 {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET || "pagepilot";

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 credentials: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY",
    );
  }

  return {
    aws: new AwsClient({ accessKeyId, secretAccessKey, region: "auto", service: "s3" }),
    base: `https://${accountId}.r2.cloudflarestorage.com`,
    bucket,
  };
}

/** Every char our keys use is unreserved, but encode per segment anyway so the
 * URL we sign and the URL we send can never disagree. */
function objectUrl({ base, bucket }: R2, key: string): string {
  return `${base}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * S3 answers a missing object with 404 and everything else with a body worth
 * seeing, so collapse the first to null and shout about the rest.
 */
async function send(request: Promise<Response>, what: string): Promise<Response | null> {
  const res = await request;
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`R2 ${what} failed: ${res.status} ${await res.text()}`);
  }
  return res;
}

/**
 * An id is 12 hex characters and nothing else, because it goes in a URL people
 * paste around. The title still lives in the object key —
 * `pages/<id>~<base64url title>.html` — so listing stays a single ListObjectsV2
 * with no index file for concurrent deploys to clobber and no per-item
 * HeadObject. Reading one page costs a prefix list to recover the key.
 *
 * 48 bits of randomness. Since viewing is unauthenticated, that entropy is the
 * only thing standing between a page and a stranger, so don't shorten it.
 */
function makeId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

function keyOf(id: string, title: string | undefined): string {
  const label = (title || "").trim().slice(0, 120);
  return `${PREFIX}${id}~${Buffer.from(label, "utf8").toString("base64url")}.html`;
}

function idOf(key: string): string {
  return key.slice(PREFIX.length).split("~")[0]!;
}

function titleOf(key: string): string {
  const body = key.slice(PREFIX.length, -".html".length);
  const sep = body.indexOf("~");
  if (sep === -1) return body;
  const encoded = body.slice(sep + 1);
  if (!encoded) return body.slice(0, sep);
  const decoded = Buffer.from(encoded, "base64url").toString("utf8");
  // base64url decoding never throws, it just drops junk — fall back if lossy.
  return Buffer.from(decoded, "utf8").toString("base64url") === encoded
    ? decoded
    : encoded;
}

type Listing = {
  objects: { key: string; size: number; modifiedAt: Date }[];
  nextCursor?: string;
};

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function unescapeXml(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]!);
}

function tagOf(xml: string, name: string): string | undefined {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? unescapeXml(match[1]!) : undefined;
}

/**
 * ListObjectsV2 is the only R2 call that answers in XML. The shape is fixed and
 * shallow — a flat run of <Contents> plus a truncation flag — so it does not
 * justify pulling a parser back in.
 */
function parseListing(xml: string): Listing {
  const objects = Array.from(xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)).map(
    (match) => {
      const entry = match[1]!;
      return {
        key: tagOf(entry, "Key") ?? "",
        size: Number(tagOf(entry, "Size") ?? 0),
        modifiedAt: new Date(tagOf(entry, "LastModified") ?? 0),
      };
    },
  );
  const truncated = tagOf(xml, "IsTruncated") === "true";
  return {
    objects,
    nextCursor: truncated ? tagOf(xml, "NextContinuationToken") : undefined,
  };
}

async function listObjects(
  client: R2,
  {
    prefix = PREFIX,
    maxKeys,
    cursor,
  }: { prefix?: string; maxKeys?: number; cursor?: string },
): Promise<Listing> {
  const query = new URLSearchParams({ "list-type": "2", prefix });
  if (maxKeys) query.set("max-keys", String(maxKeys));
  if (cursor) query.set("continuation-token", cursor);

  const res = await send(
    client.aws.fetch(`${client.base}/${client.bucket}?${query}`),
    "list",
  );
  return res ? parseListing(await res.text()) : { objects: [] };
}

function publicUrl(id: string): string {
  let base = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
  // VERCEL_PROJECT_PRODUCTION_URL only exists on Vercel, so its presence means a
  // localhost PUBLIC_URL was copied out of .env.local — honouring that would hand
  // agents dead links, so the deployment's own domain wins.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel && (!base || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(base))) {
    base = `https://${vercel}`;
  }
  return base ? `${base}/p/${id}` : `/p/${id}`;
}

/**
 * Reading a page costs a prefix list to recover its key and then the GET, and
 * the id-to-key mapping does not change while the page sits there. Remembering
 * it per instance turns the hot path into one R2 call on a warm function.
 * Bounded because a busy instance would otherwise hold every id it ever served.
 */
const KEY_CACHE_MAX = 512;
const keyCache = new Map<string, string>();

function rememberKey(id: string, key: string): void {
  keyCache.delete(id);
  keyCache.set(id, key);
  if (keyCache.size > KEY_CACHE_MAX) {
    const oldest = keyCache.keys().next().value;
    if (oldest !== undefined) keyCache.delete(oldest);
  }
}

/** Recovers the full key from a bare id, since the key also carries the title. */
async function resolveKey(client: R2, id: string): Promise<string | null> {
  if (!/^[a-f0-9]{12}$/.test(id)) return null;
  // Anchored on the `~` so `abc123~` can't be matched by a longer id.
  const { objects } = await listObjects(client, {
    prefix: `${PREFIX}${id}~`,
    maxKeys: 1,
  });
  return objects[0]?.key ?? null;
}

export async function deployPage(
  html: string,
  title?: string,
): Promise<PageRecord & { url: string }> {
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new Error("HTML exceeds the 900 KB limit");
  }
  const client = getClient();
  const id = makeId();
  const key = keyOf(id, title);

  await send(
    client.aws.fetch(objectUrl(client, key), {
      method: "PUT",
      body: html,
      headers: {
        "content-type": "text/html; charset=utf-8",
        // The transport is already TLS, so hashing up to 900 KB a second time
        // just to sign it is CPU spent for nothing.
        "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      },
    }),
    "put",
  );
  invalidateStats();

  return {
    id,
    title: titleOf(key),
    createdAt: new Date().toISOString(),
    url: publicUrl(id),
  };
}

export async function listPages(
  limit = 24,
  cursor?: string,
): Promise<{
  items: (PageRecord & { url: string })[];
  nextCursor?: string;
}> {
  const client = getClient();
  const { objects, nextCursor } = await listObjects(client, {
    maxKeys: Math.max(1, Math.min(limit, 100)),
    cursor,
  });
  const items = objects
    .filter((object) => object.key.endsWith(".html"))
    .map((object) => ({
      id: idOf(object.key),
      title: titleOf(object.key),
      createdAt: object.modifiedAt.toISOString(),
      url: publicUrl(idOf(object.key)),
    }));

  return { items, nextCursor };
}

export async function deletePage(id: string): Promise<boolean> {
  const client = getClient();
  const key = await resolveKey(client, id);
  if (!key) return false;
  await send(client.aws.fetch(objectUrl(client, key), { method: "DELETE" }), "delete");
  keyCache.delete(id);
  invalidateStats();
  return true;
}

export async function renamePage(id: string, title: string): Promise<boolean> {
  const client = getClient();
  const oldKey = await resolveKey(client, id);
  if (!oldKey) return false;
  const newKey = keyOf(id, title);
  if (oldKey === newKey) return true;
  keyCache.delete(id);

  await send(
    client.aws.fetch(objectUrl(client, newKey), {
      method: "PUT",
      headers: {
        "x-amz-copy-source": `/${client.bucket}/${oldKey
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
        "x-amz-metadata-directive": "REPLACE",
        "content-type": "text/html; charset=utf-8",
        "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
      },
    }),
    "copy",
  );
  await send(client.aws.fetch(objectUrl(client, oldKey), { method: "DELETE" }), "delete");
  rememberKey(id, newKey);
  invalidateStats();
  return true;
}

async function fetchPage(id: string): Promise<Response | null> {
  const client = getClient();

  // A stale entry is safe: the GET still has to find the object, and a 404 here
  // only means the page was renamed or deleted, so fall back to the list.
  const remembered = keyCache.get(id);
  if (remembered) {
    const hit = await send(client.aws.fetch(objectUrl(client, remembered)), "get");
    if (hit) return hit;
    keyCache.delete(id);
  }

  const key = await resolveKey(client, id);
  if (!key) return null;
  const res = await send(client.aws.fetch(objectUrl(client, key)), "get");
  if (res) rememberKey(id, key);
  return res;
}

export async function getPageHtml(id: string): Promise<string | null> {
  return (await fetchPage(id))?.text() ?? null;
}

export type PageBody = { body: ReadableStream; etag?: string };

/**
 * The bytes go browser-bound untouched. Materialising a 900 KB page as a JS
 * string only to re-encode it on the way out is a decode plus two copies of
 * billable CPU per view; piping the body through is I/O the platform does not
 * charge for.
 *
 * R2's ETag rides along because without a validator nothing between here and
 * the browser can answer a conditional request, so every revalidation had to
 * re-send the whole page.
 */
export async function getPageStream(id: string): Promise<PageBody | null> {
  const res = await fetchPage(id);
  if (!res?.body) return null;
  return { body: res.body, etag: res.headers.get("etag") ?? undefined };
}

export type StorageStats = {
  bucket: string;
  files: number;
  bytes: number;
  history: { date: string; bytes: number; files: number }[];
};

/**
 * A full-bucket walk, so hold the answer for a minute. `/storage` is one
 * person's admin screen and its numbers are a progress bar, not a ledger.
 *
 * ponytail: per-instance memo. A shared cache only matters once more than one
 * function instance is serving this page often enough to notice.
 */
const STATS_TTL_MS = 60_000;
let cachedStats: { at: number; value: StorageStats } | undefined;

function invalidateStats(): void {
  cachedStats = undefined;
}

export async function getStorageStats(): Promise<StorageStats> {
  const now = Date.now();
  if (cachedStats && now - cachedStats.at < STATS_TTL_MS) return cachedStats.value;

  const client = getClient();
  let files = 0;
  let bytes = 0;
  const objects: { bytes: number; modifiedAt: Date }[] = [];
  let cursor: string | undefined;

  do {
    const listing = await listObjects(client, { cursor });
    for (const object of listing.objects) {
      files += 1;
      bytes += object.size;
      objects.push({ bytes: object.size, modifiedAt: object.modifiedAt });
    }
    cursor = listing.nextCursor;
  } while (cursor);

  const value = { bucket: client.bucket, files, bytes, history: storageHistory(objects) };
  cachedStats = { at: now, value };
  return value;
}

function storageHistory(
  objects: { bytes: number; modifiedAt: Date }[],
  days = 30,
): { date: string; bytes: number; files: number }[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - days + 1);

  let bytes = 0;
  let files = 0;
  const changes = new Map<string, { bytes: number; files: number }>();

  for (const object of objects) {
    if (object.modifiedAt < start) {
      bytes += object.bytes;
      files += 1;
      continue;
    }
    const date = object.modifiedAt.toISOString().slice(0, 10);
    const current = changes.get(date) ?? { bytes: 0, files: 0 };
    current.bytes += object.bytes;
    current.files += 1;
    changes.set(date, current);
  }

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(start);
    day.setUTCDate(day.getUTCDate() + index);
    const date = day.toISOString().slice(0, 10);
    const change = changes.get(date);
    bytes += change?.bytes ?? 0;
    files += change?.files ?? 0;
    return { date, bytes, files };
  });
}

const DELETE_CONCURRENCY = 20;

export async function deleteAllPages(): Promise<number> {
  const client = getClient();
  let deleted = 0;

  while (true) {
    const { objects } = await listObjects(client, { maxKeys: 1000 });
    if (objects.length === 0) {
      keyCache.clear();
      invalidateStats();
      return deleted;
    }

    // One DELETE per object rather than a batch: the batch endpoint wants a
    // hand-built XML body with a Content-MD5, and this path runs from a button
    // nobody presses twice.
    for (let i = 0; i < objects.length; i += DELETE_CONCURRENCY) {
      const chunk = objects.slice(i, i + DELETE_CONCURRENCY);
      await Promise.all(
        chunk.map((object) =>
          send(
            client.aws.fetch(objectUrl(client, object.key), { method: "DELETE" }),
            "delete",
          ),
        ),
      );
      deleted += chunk.length;
    }
  }
}
