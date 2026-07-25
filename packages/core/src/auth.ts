export const SESSION_COOKIE = "pagepilot_session";

/**
 * Two ways in, one secret: the MCP server sends `authorization: Bearer <key>`,
 * a browser sends an httpOnly cookie set by /api/unlock. The cookie is httpOnly
 * so page scripts can't read the key, and SameSite=Lax keeps it off cross-site
 * POSTs, which is what stops a hostile page from deleting your vault.
 *
 * ponytail: the cookie value is the key itself rather than a derived session
 * token, so there is nothing to revoke but the key. Issue real sessions if this
 * ever has more than one holder.
 */
export function presentedKey(req: Request): string {
  const header = req.headers.get("authorization") || "";
  if (header.startsWith("Bearer ")) return header.slice(7);

  const cookies = req.headers.get("cookie") || "";
  for (const part of cookies.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return "";
}

/** Constant-time compare so a wrong key can't be narrowed down by timing. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isValidKey(key: string): boolean {
  const expected = process.env.PAGEPILOT_API_KEY;
  return !!expected && !!key && sameSecret(key, expected);
}

export function isAuthed(req: Request): boolean {
  return isValidKey(presentedKey(req));
}
