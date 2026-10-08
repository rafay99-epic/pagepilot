import { DurableObject } from "cloudflare:workers";
import type { Env } from "./env";

// Link unfurlers and crawlers fetch a page without anyone reading it.
const BOT =
  /bot|crawl|spider|preview|slack|discord|whatsapp|telegram|facebookexternalhit/i;

// How long an image no page embeds is kept. Dropping one by mistake, or
// deleting a page before republishing it, stays harmless for a day.
const GRACE_MS = 86_400_000;

// Total views and latest viewed UTC day, keyed by page id.
export type ViewTotals = Record<string, { views: number; lastViewed: string }>;

// The only state kept outside R2: view counts as one row per page per UTC
// day, and which page embeds which uploaded image. No visitor data.
export class Ledger extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS views (id TEXT NOT NULL, day TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (id, day));
      CREATE TABLE IF NOT EXISTS embeds (page TEXT NOT NULL, asset TEXT NOT NULL, held INTEGER NOT NULL, PRIMARY KEY (page, asset));
      CREATE INDEX IF NOT EXISTS embeds_asset ON embeds (asset);
      CREATE TABLE IF NOT EXISTS released (asset TEXT PRIMARY KEY, at INTEGER NOT NULL);
    `);
  }

  record(id: string): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO views (id, day, n) VALUES (?, ?, 1) ON CONFLICT (id, day) DO UPDATE SET n = n + 1",
      id,
      new Date().toISOString().slice(0, 10),
    );
  }

  // Every page that has been viewed at least once.
  totals(): ViewTotals {
    const totals: ViewTotals = {};
    const rows = this.ctx.storage.sql.exec<{
      id: string;
      views: number;
      lastViewed: string;
    }>("SELECT id, SUM(n) AS views, MAX(day) AS lastViewed FROM views GROUP BY id");
    for (const { id, views, lastViewed } of rows) totals[id] = { views, lastViewed };
    return totals;
  }

  // Step one of writing a page: adds the images its new HTML embeds, so no
  // live page ever embeds an image the ledger has not heard of. Returns the
  // marker settle() takes once the page is written.
  hold(page: string, assets: string[]): number {
    const sql = this.ctx.storage.sql;
    const held = Date.now();
    for (const asset of assets) {
      sql.exec(
        "INSERT OR REPLACE INTO embeds (page, asset, held) VALUES (?, ?, ?)",
        page,
        asset,
        held,
      );
      sql.exec("DELETE FROM released WHERE asset = ?", asset);
    }
    return held;
  }

  // Step two: lets go of the images the page held before `held` and has not
  // held again since. Whatever a newer write of the page holds is untouched,
  // so calls arriving out of order only keep an image longer. An image no
  // page embeds any more is deleted a day later, by alarm().
  async settle(page: string, held: number): Promise<void> {
    const sql = this.ctx.storage.sql;
    const dropped = sql
      .exec<{
        asset: string;
      }>("DELETE FROM embeds WHERE page = ? AND held < ? RETURNING asset", page, held)
      .toArray();
    for (const { asset } of dropped) {
      sql.exec(
        "INSERT OR IGNORE INTO released (asset, at) SELECT ?, ? WHERE NOT EXISTS (SELECT 1 FROM embeds WHERE asset = ?)",
        asset,
        Date.now(),
        asset,
      );
    }
    if (dropped.length > 0 && (await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + GRACE_MS);
    }
  }

  // Drops everything known about a deleted page.
  async forget(page: string): Promise<void> {
    this.ctx.storage.sql.exec("DELETE FROM views WHERE id = ?", page);
    await this.settle(page, Number.MAX_SAFE_INTEGER);
  }

  // Deletes from the bucket the images released by `before` that no page has
  // embedded again. A failed delete keeps its rows, so it is retried.
  // ponytail: 1,000 images a run, R2's limit for one delete call. A longer
  // backlog drains over the next runs, which the alarm schedules itself.
  async sweep(before: number): Promise<void> {
    const sql = this.ctx.storage.sql;
    const due = sql
      .exec<{
        asset: string;
      }>("SELECT asset FROM released WHERE at <= ? LIMIT 1000", before)
      .toArray();
    if (due.length > 0) {
      await this.env.PAGES.delete(due.map((row) => row.asset));
      for (const { asset } of due) {
        sql.exec("DELETE FROM released WHERE asset = ?", asset);
      }
    }
    const next = sql.exec<{ at: number | null }>("SELECT MIN(at) AS at FROM released");
    const at = next.one().at;
    if (at !== null) await this.ctx.storage.setAlarm(at + GRACE_MS);
  }

  override async alarm(): Promise<void> {
    await this.sweep(Date.now() - GRACE_MS);
  }
}

function ledger(env: Env) {
  return env.LEDGER?.get(env.LEDGER.idFromName("ledger"));
}

// Step one of writing a page; see Ledger.hold. Throws when the page embeds
// images and they cannot be recorded, because a later cleanup could then
// delete them from under it. Without a ledger nothing is ever cleaned up, so
// there is nothing to record and the marker is undefined.
export async function holdAssets(
  env: Env,
  page: string,
  assets: string[],
): Promise<number | undefined> {
  try {
    return await ledger(env)?.hold(page, assets);
  } catch (error) {
    if (assets.length > 0) throw error;
    return undefined;
  }
}

// Everything below is best effort. It is bookkeeping, so a page must still
// load, update and delete when the ledger is missing or failing. A missed
// call only keeps an image longer than it had to be.

export async function settleAssets(env: Env, page: string, held: number): Promise<void> {
  await ledger(env)
    ?.settle(page, held)
    .catch(() => undefined);
}

export async function forgetPage(env: Env, page: string): Promise<void> {
  await ledger(env)
    ?.forget(page)
    .catch(() => undefined);
}

export async function viewTotals(env: Env): Promise<ViewTotals> {
  const totals = await ledger(env)
    ?.totals()
    .catch(() => undefined);
  return totals ?? {};
}

// Counts a public page view after the response is on its way. HEAD requests,
// misses and bots are not views.
export function countView(
  request: Request,
  response: Response,
  env: Env,
  ctx: ExecutionContext,
  id: string,
): void {
  if (request.method !== "GET") return;
  if (response.status !== 200 && response.status !== 304) return;
  if (BOT.test(request.headers.get("user-agent") ?? "")) return;
  ctx.waitUntil(Promise.resolve(ledger(env)?.record(id)).catch(() => undefined));
}
