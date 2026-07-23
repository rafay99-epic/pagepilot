import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

export type SlopRecord = {
  id: string;
  title: string;
  createdAt: string;
};

type IndexFile = {
  slops: SlopRecord[];
};

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

async function readIndex(client: S3Client, bucket: string): Promise<IndexFile> {
  try {
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: "_index.json",
    });
    const res = await client.send(cmd);
    const body = await res.Body?.transformToString();
    return body ? JSON.parse(body) : { slops: [] };
  } catch (e: unknown) {
    if ((e as { name?: string }).name === "NoSuchKey") {
      return { slops: [] };
    }
    throw e;
  }
}

async function writeIndex(
  client: S3Client,
  bucket: string,
  index: IndexFile,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: "_index.json",
      Body: JSON.stringify(index),
      ContentType: "application/json",
    }),
  );
}

function getPublicUrl(id: string): string {
  const base = (process.env.PUBLIC_URL || "").replace(/\/+$/, "");
  return base ? `${base}/view/${id}` : `/view/${id}`;
}

export async function deploySlop(
  html: string,
  title?: string,
): Promise<SlopRecord & { url: string }> {
  const { client, bucket } = getClient();
  const id = crypto.randomUUID().slice(0, 8);
  const label = title || `page-${id}`;
  const key = `slops/${id}.html`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: html,
      ContentType: "text/html",
    }),
  );

  const index = await readIndex(client, bucket);
  const record: SlopRecord = {
    id,
    title: label,
    createdAt: new Date().toISOString(),
  };
  index.slops.unshift(record);
  await writeIndex(client, bucket, index);

  return { ...record, url: getPublicUrl(id) };
}

export async function listSlops(
  limit = 50,
  cursor?: string,
): Promise<{ items: SlopRecord[]; nextCursor?: string }> {
  const { client, bucket } = getClient();
  const index = await readIndex(client, bucket);
  const sorted = index.slops.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const startIndex = cursor ? sorted.findIndex((s) => s.id === cursor) + 1 : 0;
  const page = sorted.slice(startIndex, startIndex + limit);

  return {
    items: page,
    nextCursor: page.length === limit ? page[page.length - 1].id : undefined,
  };
}

export async function deleteSlop(id: string): Promise<void> {
  const { client, bucket } = getClient();

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: `slops/${id}.html`,
    }),
  );

  const index = await readIndex(client, bucket);
  index.slops = index.slops.filter((s) => s.id !== id);
  await writeIndex(client, bucket, index);
}

export async function getSlopHtml(id: string): Promise<string | null> {
  const { client, bucket } = getClient();
  try {
    const cmd = new GetObjectCommand({
      Bucket: bucket,
      Key: `slops/${id}.html`,
    });
    const res = await client.send(cmd);
    return (await res.Body?.transformToString()) ?? null;
  } catch (e: unknown) {
    if ((e as { name?: string }).name === "NoSuchKey") return null;
    throw e;
  }
}
