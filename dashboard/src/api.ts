// Dashboard API calls. Responses are parsed with the shared schemas so a
// contract drift between the Worker and this dashboard fails loudly here
// instead of surfacing as a silent rendering bug.
import { z } from "zod";
import type { Page } from "../../shared/api";
import { pageListSchema, pageSchema, storageReportSchema } from "../../shared/api";

export const SESSION_EXPIRED = "session-expired";

// The Worker only ever serves pages under this origin; refuse anything else
// before a URL reaches an iframe src or an "Open" link.
const sameOriginPage = pageSchema.extend({
  url: pageSchema.shape.url.refine(
    (url) => new URL(url).origin === window.location.origin,
    "Page URL is not same-origin.",
  ),
});

const pageListWithOrigin = pageListSchema.extend({
  items: z.array(sameOriginPage),
});

const largestPageWithOrigin = sameOriginPage.extend({
  bytes: storageReportSchema.shape.largest.element.shape.bytes,
});

const storageReportWithOrigin = storageReportSchema.extend({
  largest: z.array(largestPageWithOrigin).max(10),
});

// 401/403/503 mean the same thing on every dashboard route, so the status
// handling lives here once; each call only supplies its own failure message.
async function fetchDashboard(
  path: string,
  init: RequestInit,
  failureMessage: string,
): Promise<Response> {
  const response = await fetch(path, {
    credentials: "same-origin",
    redirect: "error",
    ...init,
  });
  if (response.status === 401 || response.status === 403)
    throw new Error("Session expired.", { cause: SESSION_EXPIRED });
  if (response.status === 503)
    throw new Error(
      "Dashboard access has not been configured. Set the Cloudflare Access team domain and audience on the Worker.",
    );
  if (!response.ok) throw new Error(failureMessage);
  return response;
}

// Every page, newest first. The Worker lists in key order, and keys are random
// ids, so a sensible order needs the full set.
// ponytail: loads the whole vault up front, 100 pages per request. Fine into
// the low thousands; past that, keep a date-sorted index on write and page it.
export async function listAllPages() {
  const items: Page[] = [];
  let cursor = "";
  do {
    const response = await fetchDashboard(
      `/api/dashboard/pages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      {},
      "Could not load pages.",
    );
    const batch = pageListWithOrigin.parse(await response.json());
    items.push(...batch.items);
    cursor = batch.nextCursor ?? "";
  } while (cursor);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deletePage(id: string) {
  await fetchDashboard(
    `/api/dashboard/pages/${id}`,
    { method: "DELETE" },
    "Could not delete this page. Reload to check your session and try again.",
  );
}

export async function getStorage() {
  const response = await fetchDashboard(
    "/api/dashboard/storage",
    {},
    "Could not load storage.",
  );
  return storageReportWithOrigin.parse(await response.json());
}
