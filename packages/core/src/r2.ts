import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";

export type PageRecord = {
  id: string;
  title: string;
  createdAt: string;
  shared: boolean;
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
 * An id is opaque: `<p|s>-<random>~<base64url title>`.
 *
 * Both the share flag and the title live in the id, so one ListObjectsV2 answers
 * "what exists, what is it called, is it public" with no index file for
 * concurrent deploys to clobber and no per-item HeadObject. base64url rather
 * than encodeURIComponent because an id goes into a URL *path segment*, and a
 * percent-encoded `/` gets split back out by routers.
 *
 * Don't parse an id outside this module — use `titleOf` / `isSharedId`.
 */
function makeId(title: string | undefined, shared: boolean): string {
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const head = `${shared ? "s" : "p"}-${random}`;
  const label = (title || "").trim().slice(0, 120);
  if (!label) return head;
  return `${head}~${Buffer.from(label, "utf8").toString("base64url")}`;
}

/** Anything without an explicit `s-` marker is private. Unmarked ids fail closed. */
export function isSharedId(id: string): boolean {
  return id.startsWith("s-");
}

function withShare(id: string, shared: boolean): string {
  return `${shared ? "s" : "p"}-${id.replace(/^[ps]-/, "")}`;
}

function titleOf(id: string): string {
  const sep = id.indexOf("~");
  if (sep === -1) return id.replace(/^[ps]-/, "");
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
  let base = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
  // VERCEL_PROJECT_PRODUCTION_URL only exists on Vercel, so its presence means a
  // localhost PUBLIC_URL was copied out of .env.local — honouring that would hand
  // agents dead share links, so the deployment's own domain wins.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel && (!base || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(base))) {
    base = `https://${vercel}`;
  }
  return base ? `${base}/view/${id}` : `/view/${id}`;
}

export async function deployPage(
  html: string,
  title?: string,
  shared = false,
): Promise<PageRecord & { url: string }> {
  const { client, bucket } = getClient();
  const id = makeId(title, shared);

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
    shared,
    url: getPublicUrl(id),
  };
}

/**
 * Flipping the share flag rewrites the id, so the old URL dies. That is the
 * point: unsharing must revoke a link you already handed out, and R2 has no
 * per-object ACL to flip instead.
 */
export async function setShared(
  id: string,
  shared: boolean,
): Promise<PageRecord & { url: string }> {
  const { client, bucket } = getClient();
  const next = withShare(id, shared);

  if (next !== id) {
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${keyOf(id)}`,
        Key: keyOf(next),
        ContentType: "text/html; charset=utf-8",
        MetadataDirective: "REPLACE",
      }),
    );
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: keyOf(id) }));
  }

  return {
    id: next,
    title: titleOf(next),
    createdAt: new Date().toISOString(),
    shared,
    url: getPublicUrl(next),
  };
}

export async function listPages(
  limit = 50,
  cursor?: string,
): Promise<{ items: (PageRecord & { url: string })[]; nextCursor?: string }> {
  const { client, bucket } = getClient();

  // R2 lists lexicographically, so newest-first needs every key in hand before
  // slicing. ponytail: full scan per request; move to a date-ordered key prefix
  // if this bucket ever holds enough pages for the scan to hurt.
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
      const id = obj.Key.slice(PREFIX.length, -".html".length);
      all.push({
        id,
        title: titleOf(id),
        createdAt: (obj.LastModified ?? new Date(0)).toISOString(),
        shared: isSharedId(id),
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

export async function deletePage(id: string): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: keyOf(id) }));
}

export async function getPageHtml(id: string): Promise<string | null> {
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
