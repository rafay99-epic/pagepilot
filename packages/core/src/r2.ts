import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

export type SlopRecord = {
  id: string;
  title: string;
  createdAt: string;
};

const PREFIX = "slops/";

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
 * An id is opaque: `<random>~<base64url title>`. Keeping the title in the key
 * means listing is one ListObjectsV2 with no index file for concurrent deploys
 * to clobber. base64url rather than encodeURIComponent because an id goes into a
 * URL *path segment*, and a percent-encoded `/` gets split back out by routers.
 * Don't parse an id outside this module — use `titleOf`.
 */
function makeId(title: string | undefined): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const label = (title || "").trim().slice(0, 120);
  if (!label) return random;
  return `${random}~${Buffer.from(label, "utf8").toString("base64url")}`;
}

function titleOf(id: string): string {
  const sep = id.indexOf("~");
  if (sep === -1) return id;
  const encoded = id.slice(sep + 1);
  const decoded = Buffer.from(encoded, "base64url").toString("utf8");
  // base64url decoding never throws, it just drops junk — fall back if lossy.
  return Buffer.from(decoded, "utf8").toString("base64url") === encoded
    ? decoded
    : encoded;
}

function keyOf(id: string): string {
  return `${PREFIX}${id}.html`;
}

function getPublicUrl(id: string): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = (process.env.PUBLIC_URL || (vercel ? `https://${vercel}` : "")).replace(
    /\/+$/,
    "",
  );
  return base ? `${base}/view/${id}` : `/view/${id}`;
}

export async function deploySlop(
  html: string,
  title?: string,
): Promise<SlopRecord & { url: string }> {
  const { client, bucket } = getClient();
  const id = makeId(title);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: keyOf(id),
      Body: html,
      ContentType: "text/html; charset=utf-8",
    }),
  );

  return {
    id,
    title: titleOf(id),
    createdAt: new Date().toISOString(),
    url: getPublicUrl(id),
  };
}

export async function listSlops(
  limit = 50,
  cursor?: string,
): Promise<{ items: (SlopRecord & { url: string })[]; nextCursor?: string }> {
  const { client, bucket } = getClient();

  // R2 lists lexicographically, so newest-first needs every key in hand before
  // slicing. ponytail: full scan per request; move to a date-ordered key prefix
  // if this bucket ever holds enough pages for the scan to hurt.
  const all: SlopRecord[] = [];
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
      const id = obj.Key.slice(PREFIX.length, -".html".length);
      all.push({
        id,
        title: titleOf(id),
        createdAt: (obj.LastModified ?? new Date(0)).toISOString(),
      });
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const start = cursor ? all.findIndex((s) => s.id === cursor) + 1 : 0;
  const page = all.slice(start, start + limit);

  return {
    items: page.map((s) => ({ ...s, url: getPublicUrl(s.id) })),
    nextCursor: start + limit < all.length ? page[page.length - 1]?.id : undefined,
  };
}

export async function deleteSlop(id: string): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: keyOf(id) }));
}

export async function getSlopHtml(id: string): Promise<string | null> {
  const { client, bucket } = getClient();
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: keyOf(id) }),
    );
    return (await res.Body?.transformToString()) ?? null;
  } catch (e: unknown) {
    if ((e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}
