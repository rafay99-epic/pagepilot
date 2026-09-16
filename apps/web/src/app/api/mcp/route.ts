import { mcpHandler } from "@pagepilot/core/mcp";
import { isAuthed, unauthorized } from "@pagepilot/core/auth";

/**
 * The longest thing a tool does is PUT 900 KB to R2. A minute was headroom
 * nothing here needs, and it let a request that stalls hold a function open for
 * that whole minute.
 */
export const maxDuration = 15;

/**
 * Bearer in, protocol out. The handler itself builds a fresh server per
 * request and speaks both eras: 2026-07-28 clients skip the handshake
 * entirely, 2025-era clients keep their initialize flow, and 2025 session
 * GET/DELETE are answered 405 by the stateless serving.
 */
async function handle(request: Request): Promise<Response> {
  // The middleware already rejected this, so reaching it means the middleware
  // was bypassed. Kept because the key is the only thing guarding the vault.
  if (!isAuthed(request)) return unauthorized();
  return mcpHandler.fetch(request);
}

export { handle as POST, handle as GET };
