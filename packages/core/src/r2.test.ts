/**
 * Round-trips pages through the real bucket. Run with credentials loaded:
 *   bun --env-file=../../.env.local test
 */
import { expect, test } from "bun:test";
import {
  deploySlop,
  listSlops,
  deleteSlop,
  getSlopHtml,
  setShared,
  isSharedId,
} from "./r2";
import { isValidKey } from "./auth";

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

test("pages are private unless asked otherwise, and unmarked ids fail closed", async () => {
  const page = await deploySlop("<h1>secret</h1>", "secret plan");
  try {
    expect(page.shared).toBe(false);
    expect(isSharedId(page.id)).toBe(false);
  } finally {
    await deleteSlop(page.id);
  }
  // Anything the share marker doesn't vouch for must not be treated as public.
  expect(isSharedId("a1b2c3d4e5f6")).toBe(false);
  expect(isSharedId("p-a1b2c3d4e5f6")).toBe(false);
  expect(isSharedId("s-a1b2c3d4e5f6")).toBe(true);
});

test("sharing flips the id so unsharing revokes the old link", async () => {
  const title = "shared / plan ~ café";
  const page = await deploySlop("<h1>share me</h1>", title);
  let current = page.id;
  try {
    const shared = await setShared(current, true);
    current = shared.id;
    expect(shared.shared).toBe(true);
    expect(isSharedId(shared.id)).toBe(true);
    expect(shared.title).toBe(title); // title survives the copy
    expect(shared.id).not.toBe(page.id); // old URL is dead
    expect(await getSlopHtml(page.id)).toBeNull();
    expect(await getSlopHtml(shared.id)).toBe("<h1>share me</h1>");
    expect(encodeURIComponent(shared.id)).toBe(shared.id);

    const back = await setShared(current, false);
    current = back.id;
    expect(isSharedId(back.id)).toBe(false);
    expect(await getSlopHtml(shared.id)).toBeNull(); // revoked
    expect(await getSlopHtml(back.id)).toBe("<h1>share me</h1>");

    const listed = (await listSlops(100)).items.find((p) => p.id === back.id);
    expect(listed?.shared).toBe(false);
  } finally {
    await deleteSlop(current);
  }
}, 30_000); // ~10 sequential R2 round trips

test("missing page reads as null, not a throw", async () => {
  expect(await getSlopHtml("definitely-not-a-real-id")).toBeNull();
});

test("key check rejects empty, wrong and near-miss keys", () => {
  const real = process.env.PAGEPILOT_API_KEY!;
  expect(isValidKey(real)).toBe(true);
  expect(isValidKey("")).toBe(false);
  expect(isValidKey(real + "x")).toBe(false);
  expect(isValidKey(real.slice(0, -1))).toBe(false);
});

// Regression: production had PUBLIC_URL=http://localhost:3000 copied from
// .env.local, so every share link an agent got back was dead.
test("a localhost PUBLIC_URL never wins over the Vercel domain", async () => {
  const saved = {
    pub: process.env.PUBLIC_URL,
    v: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  };
  process.env.PUBLIC_URL = "http://localhost:3000";
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "pagepilot.rafay99.com";
  try {
    const page = await deploySlop("<h1>url check</h1>", "url check");
    expect(page.url).toBe(`https://pagepilot.rafay99.com/view/${page.id}`);
    await deleteSlop(page.id);
  } finally {
    process.env.PUBLIC_URL = saved.pub;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = saved.v;
  }
});
