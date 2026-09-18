// The dashboard API contract. The Worker builds responses from these types and
// the dashboard parses responses with these schemas, so a field change that
// one side misses fails the build or the parse instead of drifting silently.
import { z } from "zod";

export const PAGE_ID = /^(?:[a-f0-9]{12}|[a-f0-9]{32})$/;

// R2 has no hard cap. This is the storage the free tier includes each month.
export const FREE_TIER_BYTES = 10_000_000_000;

export const pageSchema = z.object({
  id: z.string().regex(PAGE_ID),
  title: z.string(),
  url: z.string().url(),
  createdAt: z.string().datetime(),
});

export const pageListSchema = z.object({
  items: z.array(pageSchema),
  nextCursor: z.string().optional(),
});

const count = z.number().int().nonnegative();

export const storageReportSchema = z.object({
  usedBytes: count,
  freeTierBytes: count,
  objectCount: count,
  pageCount: count,
  // False when the bucket holds more objects than one report scans.
  complete: z.boolean(),
  // Uploads grouped by calendar month (UTC), oldest first.
  months: z.array(
    z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), bytes: count, pages: count }),
  ),
  largest: z.array(pageSchema.extend({ bytes: count })).max(10),
});

export const deleteResultSchema = z.object({
  id: z.string().regex(PAGE_ID),
  deleted: z.literal(true),
});

export const apiErrorSchema = z.object({ error: z.string() });

export type Page = z.infer<typeof pageSchema>;
export type PageList = z.infer<typeof pageListSchema>;
export type StorageReport = z.infer<typeof storageReportSchema>;
export type DeleteResult = z.infer<typeof deleteResultSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type DashboardBody = PageList | StorageReport | DeleteResult | ApiError;
