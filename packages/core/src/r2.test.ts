/**
 * Round-trips pages through the real bucket. Run with credentials loaded:
 *   bun --env-file=../../.env.local test
 */
import { expect, test } from "bun:test";
import { deployPage, listPages, deletePage, getPageHtml } from "./r2";
import { isValidKey } from "./auth";

test("deploy -> read -> list -> delete", async () => {
  const title = 'Plan: "R2" & co / 50% ~ done — café 🚀';
  const html = "<h1>hi</h1>";

  const page = await deployPage(html, title);
  expect(page.title).toBe(title); // survives the base64url round trip in the key

  // The id goes in a URL people paste around: hex only, nothing to escape, and
  // short enough to read out loud.
  expect(page.id).toMatch(/^[0-9a-f]{12}$/);
  expect(page.url.endsWith(`/p/${page.id}`)).toBe(true);

  expect(await getPageHtml(page.id)).toBe(html);

  const listed = (await listPages(200)).items.find((p) => p.id === page.id);
  expect(listed?.title).toBe(title);

  expect(await deletePage(page.id)).toBe(true);
  expect(await getPageHtml(page.id)).toBeNull();
}, 20_000);

test("a page with no title still round-trips", async () => {
  const page = await deployPage("<h1>untitled</h1>");
  try {
    expect(page.id).toMatch(/^[0-9a-f]{12}$/);
    expect(await getPageHtml(page.id)).toBe("<h1>untitled</h1>");
  } finally {
    await deletePage(page.id);
  }
}, 20_000);

test("one id can't collide with a longer one sharing its prefix", async () => {
  // resolveKey anchors on the "~" separator; without it, id "abc" would resolve
  // to a page whose id happens to start with "abc".
  const page = await deployPage("<h1>anchored</h1>", "anchored");
  try {
    expect(await getPageHtml(page.id.slice(0, 6))).toBeNull();
    expect(await getPageHtml(page.id)).toBe("<h1>anchored</h1>");
  } finally {
    await deletePage(page.id);
  }
}, 20_000);

test("missing page reads as null and deletes as false", async () => {
  expect(await getPageHtml("ffffffffffff")).toBeNull();
  expect(await deletePage("ffffffffffff")).toBe(false);
});

test("key check rejects empty, wrong and near-miss keys", () => {
  const real = process.env.PAGEPILOT_API_KEY!;
  expect(isValidKey(real)).toBe(true);
  expect(isValidKey("")).toBe(false);
  expect(isValidKey(real + "x")).toBe(false);
  expect(isValidKey(real.slice(0, -1))).toBe(false);
});

// Regression: production had PUBLIC_URL=http://localhost:3000 copied from
// .env.local, so every link an agent got back was dead.
test("a localhost PUBLIC_URL never wins over the Vercel domain", async () => {
  const saved = {
    pub: process.env.PUBLIC_URL,
    v: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  };
  process.env.PUBLIC_URL = "http://localhost:3000";
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "pagepilot.rafay99.com";
  try {
    const page = await deployPage("<h1>url check</h1>", "url check");
    expect(page.url).toBe(`https://pagepilot.rafay99.com/p/${page.id}`);
    await deletePage(page.id);
  } finally {
    process.env.PUBLIC_URL = saved.pub;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = saved.v;
  }
}, 20_000);
