import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";

export type PageRecord = {
  id: string;
  title: string;
  createdAt: string;
};

const PREFIX = "pages/";
const MAX_HTML_BYTES = 900_000;

let cachedClient: ReturnType<typeof createClient> | undefined;

export function getClient() {
  cachedClient ??= createClient();
  return cachedClient;
}

function createClient() {
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
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
    bucket,
  };
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

/** Recovers the full key from a bare id, since the key also carries the title. */
async function resolveKey(
  client: S3Client,
  bucket: string,
  id: string,
): Promise<string | null> {
  if (!/^[a-f0-9]{12}$/.test(id)) return null;
  // Anchored on the `~` so `abc123~` can't be matched by a longer id.
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${PREFIX}${id}~`,
      MaxKeys: 1,
    }),
  );
  return res.Contents?.[0]?.Key ?? null;
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

export async function deployPage(
  html: string,
  title?: string,
): Promise<PageRecord & { url: string }> {
  if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) {
    throw new Error("HTML exceeds the 900 KB limit");
  }
  const { client, bucket } = getClient();
  const id = makeId();
  const key = keyOf(id, title);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: html,
      ContentType: "text/html; charset=utf-8",
    }),
  );

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
  const { client, bucket } = getClient();
  const pageSize = Math.max(1, Math.min(limit, 100));
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: PREFIX,
      MaxKeys: pageSize,
      ContinuationToken: cursor,
    }),
  );
  const items = (res.Contents ?? [])
    .filter((obj) => obj.Key?.endsWith(".html"))
    .map((obj) => {
      const key = obj.Key!;
      return {
        id: idOf(key),
        title: titleOf(key),
        createdAt: (obj.LastModified ?? new Date(0)).toISOString(),
        url: publicUrl(idOf(key)),
      };
    });

  return {
    items,
    nextCursor: res.IsTruncated ? res.NextContinuationToken : undefined,
  };
}

export async function deletePage(id: string): Promise<boolean> {
  const { client, bucket } = getClient();
  const key = await resolveKey(client, bucket, id);
  if (!key) return false;
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return true;
}

export async function renamePage(id: string, title: string): Promise<boolean> {
  const { client, bucket } = getClient();
  const oldKey = await resolveKey(client, bucket, id);
  if (!oldKey) return false;
  const newKey = keyOf(id, title);
  if (oldKey === newKey) return true;

  await client.send(
    new CopyObjectCommand({
      Bucket: bucket,
      CopySource: encodeURIComponent(`${bucket}/${oldKey}`).replace(/%2F/g, "/"),
      Key: newKey,
      ContentType: "text/html; charset=utf-8",
      MetadataDirective: "REPLACE",
    }),
  );
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));
  return true;
}

export async function getPageHtml(id: string): Promise<string | null> {
  const { client, bucket } = getClient();
  const key = await resolveKey(client, bucket, id);
  if (!key) return null;
  try {
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return (await res.Body?.transformToString()) ?? null;
  } catch (e: unknown) {
    if ((e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}

export async function getStorageStats(): Promise<{
  bucket: string;
  files: number;
  bytes: number;
  history: { date: string; bytes: number; files: number }[];
}> {
  const { client, bucket } = getClient();
  let files = 0;
  let bytes = 0;
  const objects: { bytes: number; modifiedAt: Date }[] = [];
  let cursor: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PREFIX,
        ContinuationToken: cursor,
      }),
    );
    for (const object of res.Contents ?? []) {
      files += 1;
      bytes += object.Size ?? 0;
      objects.push({
        bytes: object.Size ?? 0,
        modifiedAt: object.LastModified ?? new Date(0),
      });
    }
    cursor = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (cursor);

  return { bucket, files, bytes, history: storageHistory(objects) };
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

export async function deleteAllPages(): Promise<number> {
  const { client, bucket } = getClient();
  let deleted = 0;

  while (true) {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, MaxKeys: 1000 }),
    );
    const objects = (listed.Contents ?? []).map((object) => ({ Key: object.Key! }));
    if (objects.length === 0) return deleted;

    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: objects, Quiet: true },
      }),
    );
    if (result.Errors?.length) {
      throw new Error(`R2 failed to delete ${result.Errors.length} object(s)`);
    }
    deleted += objects.length;
  }
}
