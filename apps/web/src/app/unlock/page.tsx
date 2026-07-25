export const metadata = { title: "Unlock — PagePilot" };

/**
 * Not a dashboard: the vault is managed entirely through MCP tools. This exists
 * only so a browser can be handed the cookie it needs to open a private page.
 */
export default async function Unlock({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; bad?: string }>;
}) {
  const { ok, bad } = await searchParams;

  return (
    <div className="mx-auto max-w-sm py-20">
      <h1 className="text-2xl font-bold tracking-tight text-white">
        Unlock this browser
      </h1>
      <p className="text-surface-500 mt-2 text-sm">
        Your pages are private. Enter your{" "}
        <code className="text-surface-300">PAGEPILOT_API_KEY</code> once and this browser
        can open them.
      </p>

      {ok && (
        <p className="mt-6 rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-4 text-sm text-emerald-400">
          Unlocked. Any page URL your agent gives you will now open here.
        </p>
      )}
      {bad && (
        <p className="mt-6 rounded-lg border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-400">
          That key was rejected.
        </p>
      )}

      <form
        method="post"
        action="/api/unlock"
        className="border-surface-800 bg-surface-900/50 mt-6 rounded-xl border p-6"
      >
        <input
          name="key"
          type="password"
          autoComplete="current-password"
          placeholder="API key"
          className="border-surface-700 focus:border-pagepilot-500 w-full rounded-lg border bg-transparent px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          className="bg-pagepilot-600 hover:bg-pagepilot-500 mt-3 w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition"
        >
          Unlock
        </button>
      </form>

      <p className="text-surface-600 mt-4 text-xs">
        Stored as an httpOnly cookie, so no script on this page can read it. There is
        nothing else to do here — deploying, listing, sharing and deleting all happen
        through the MCP tools.
      </p>
    </div>
  );
}
