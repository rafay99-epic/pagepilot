// The dashboard API contract. The Worker builds responses from these types and
// the dashboard parses responses with these schemas, so a field change that
// one side misses fails the build or the parse instead of drifting silently.
import { z } from "zod";

export const PAGE_ID = /^(?:[a-f0-9]{12}|[a-f0-9]{32})$/;

// R2 has no hard cap. This is the storage the free tier includes each month.
export const FREE_TIER_BYTES = 10_000_000_000;

const count = z.number().int().nonnegative();

export const pageSchema = z.object({
  id: z.string().regex(PAGE_ID),
  title: z.string(),
  url: z.string().url(),
  createdAt: z.string().datetime(),
  // Last publish or update; equal to createdAt until the page is updated.
  updatedAt: z.string().datetime(),
  bytes: count,
});

// A page as the owner sees it: the public record plus its view count.
export const dashboardPageSchema = pageSchema.extend({
  views: count,
  // UTC day of the latest view; absent until the first one.
  lastViewed: z.string().date().optional(),
});

export const pageListSchema = z.object({
  items: z.array(dashboardPageSchema),
  // False when the bucket holds more pages than one scan reads.
  complete: z.boolean(),
});

export const storageReportSchema = z.object({
  usedBytes: count,
  freeTierBytes: count,
  objectCount: count,
  pageCount: count,
  // Uploaded images, counted apart from pages.
  assetCount: count,
  assetBytes: count,
  // False when the bucket holds more objects than one report scans.
  complete: z.boolean(),
  // Uploads grouped by calendar month (UTC), oldest first.
  months: z.array(
    z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), bytes: count, pages: count }),
  ),
  largest: z.array(pageSchema).max(10),
});

export const deleteResultSchema = z.object({
  id: z.string().regex(PAGE_ID),
  deleted: z.literal(true),
});

export const apiErrorSchema = z.object({ error: z.string() });

export type Page = z.infer<typeof pageSchema>;
export type DashboardPage = z.infer<typeof dashboardPageSchema>;
export type PageList = z.infer<typeof pageListSchema>;
export type StorageReport = z.infer<typeof storageReportSchema>;
export type DeleteResult = z.infer<typeof deleteResultSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;
export type DashboardBody = PageList | StorageReport | DeleteResult | ApiError;
