import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

export type PageRecord = {
  id: string;
  title: string;
  createdAt: string;
};

const PREFIX = "pages/";

export function getClient() {
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
  limit = 50,
): Promise<{ items: (PageRecord & { url: string })[]; truncated: boolean }> {
  const { client, bucket } = getClient();

  // R2 lists lexicographically, so newest-first needs every key in hand before
  // slicing. ponytail: full scan per call; move to a date-ordered key prefix if
  // this bucket ever holds enough pages for the scan to hurt.
  const all: PageRecord[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PREFIX,
        ContinuationToken: token,
      }),
    );
    for (const obj of res.Contents ?? []) {
      if (!obj.Key?.endsWith(".html")) continue;
      all.push({
        id: idOf(obj.Key),
        title: titleOf(obj.Key),
        createdAt: (obj.LastModified ?? new Date(0)).toISOString(),
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    items: all.slice(0, limit).map((p) => ({ ...p, url: publicUrl(p.id) })),
    truncated: all.length > limit,
  };
}

export async function deletePage(id: string): Promise<boolean> {
  const { client, bucket } = getClient();
  const key = await resolveKey(client, bucket, id);
  if (!key) return false;
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
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
