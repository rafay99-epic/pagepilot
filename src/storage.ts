import type { StorageReport } from "../shared/api";
import { FREE_TIER_BYTES } from "../shared/api";
import { pageRecord } from "./pages";

// ponytail: one report scans at most 20 list calls of 1,000 objects, so the
// ceiling is 20,000 objects; past that the report is marked incomplete rather
// than made slower. Upgrade path when a bucket outgrows it: keep a running
// total on write, or read the numbers from Cloudflare's GraphQL analytics.
const MAX_LIST_CALLS = 20;

// Whole-bucket usage report for the owner dashboard. Totals cover every
// object; months and largest cover pages only.
export async function storageReport(
  bucket: R2Bucket,
  base: string,
): Promise<StorageReport> {
  const months = new Map<string, StorageReport["months"][number]>();
  const pages: StorageReport["largest"] = [];
  let cursor: string | undefined;
  let truncated = false;
  let usedBytes = 0;
  let objectCount = 0;
  for (let call = 0; call < MAX_LIST_CALLS; call++) {
    const listing = await bucket.list({
      limit: 1000,
      include: ["customMetadata"],
      ...(cursor ? { cursor } : {}),
    });
    for (const object of listing.objects) {
      usedBytes += object.size;
      objectCount += 1;
      const record = pageRecord(object, base);
      if (!record) continue;
      pages.push({ ...record, bytes: object.size });
      const month = object.uploaded.toISOString().slice(0, 7);
      const group = months.get(month) ?? { month, bytes: 0, pages: 0 };
      group.bytes += object.size;
      group.pages += 1;
      months.set(month, group);
    }
    truncated = listing.truncated;
    if (!listing.truncated) break;
    cursor = listing.cursor;
  }
  return {
    usedBytes,
    freeTierBytes: FREE_TIER_BYTES,
    objectCount,
    pageCount: pages.length,
    complete: !truncated,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    largest: pages.sort((a, b) => b.bytes - a.bytes).slice(0, 10),
  };
}
