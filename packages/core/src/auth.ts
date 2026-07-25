/**
 * One secret, one way in: the MCP endpoint requires `Authorization: Bearer <key>`.
 * Page viewing is deliberately unauthenticated — the URL is the capability.
 */
function presentedKey(req: Request): string {
  const header = req.headers.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
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
