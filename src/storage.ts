import type { StorageReport } from "../shared/api";
import { FREE_TIER_BYTES } from "../shared/api";
import { listAll, pageRecord } from "./pages";

// Whole-bucket usage report for the owner dashboard. Totals cover every
// object; months and largest cover pages only.
export async function storageReport(
  bucket: R2Bucket,
  base: string,
): Promise<StorageReport> {
  const { objects, complete } = await listAll(bucket);
  const months = new Map<string, StorageReport["months"][number]>();
  const pages: StorageReport["largest"] = [];
  let usedBytes = 0;
  let assetCount = 0;
  let assetBytes = 0;
  for (const object of objects) {
    usedBytes += object.size;
    if (object.key.startsWith("assets/")) {
      assetCount += 1;
      assetBytes += object.size;
    }
    const record = pageRecord(object, base);
    if (!record) continue;
    pages.push(record);
    const month = record.createdAt.slice(0, 7);
    const group = months.get(month) ?? { month, bytes: 0, pages: 0 };
    group.bytes += object.size;
    group.pages += 1;
    months.set(month, group);
  }
  return {
    usedBytes,
    freeTierBytes: FREE_TIER_BYTES,
    objectCount: objects.length,
    pageCount: pages.length,
    assetCount,
    assetBytes,
    complete,
    months: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    largest: pages.sort((a, b) => b.bytes - a.bytes).slice(0, 10),
  };
}
