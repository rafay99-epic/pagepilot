import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./env";
import { dashboardJson } from "./http";

let accessKeys:
  { issuer: string; keys: ReturnType<typeof createRemoteJWKSet> } | undefined;

// Verifies the Cloudflare Access JWT and that it belongs to the owner.
// Returns the response to send when the caller is not the owner, else undefined.
export async function authorizeOwner(
  request: Request,
  env: Env,
): Promise<Response | undefined> {
  const domain = env.ACCESS_TEAM_DOMAIN;
  if (
    !domain ||
    domain.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+cloudflareaccess\.com$/.test(domain) ||
    !env.ACCESS_AUD?.trim() ||
    !env.OWNER_EMAIL?.trim()
  ) {
    return dashboardJson({ error: "Dashboard access is not configured" }, 503);
  }
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return dashboardJson({ error: "Forbidden" }, 403);
  try {
    const issuer = `https://${domain}`;
    if (accessKeys?.issuer !== issuer) {
      accessKeys = {
        issuer,
        keys: createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
      };
    }
    const { payload } = await jwtVerify(token, accessKeys.keys, {
      algorithms: ["RS256"],
      issuer,
      audience: env.ACCESS_AUD,
      requiredClaims: ["exp", "email"],
    });
    if (payload["email"] !== env.OWNER_EMAIL) {
      return dashboardJson({ error: "Forbidden" }, 403);
    }
  } catch {
    return dashboardJson({ error: "Forbidden" }, 403);
  }
  return undefined;
}
