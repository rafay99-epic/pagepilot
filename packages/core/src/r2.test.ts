/**
 * Round-trips one page through the real bucket. Run with credentials loaded:
 *   bun --env-file=../../.env.local test
 */
import { expect, test } from "bun:test";
import { deploySlop, listSlops, deleteSlop, getSlopHtml } from "./r2";

test("deploy -> list -> view -> delete", async () => {
  const title = 'Plan: "R2" & co / 50% ~ done — café 🚀';
  const html = "<h1>hi</h1>";

  const page = await deploySlop(html, title);
  expect(page.title).toBe(title); // survives key encode/decode
  expect(page.url).toContain(page.id);
  // An id lands in a URL path segment, so it must need no escaping at all —
  // a percent-encoded "/" here would get split back out by the router.
  expect(encodeURIComponent(page.id)).toBe(page.id);

  expect(await getSlopHtml(page.id)).toBe(html);

  const listed = (await listSlops(100)).items.find((p) => p.id === page.id);
  expect(listed?.title).toBe(title);

  await deleteSlop(page.id);
  expect(await getSlopHtml(page.id)).toBeNull();
});

test("missing page reads as null, not a throw", async () => {
  expect(await getSlopHtml("definitely-not-a-real-id")).toBeNull();
});
