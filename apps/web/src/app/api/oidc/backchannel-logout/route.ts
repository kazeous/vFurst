import { createRemoteJWKSet, customFetch as joseFetch } from "jose";
import { applyFixedWindowRateLimit, getClientIp, RATE_LIMIT_FAILURE_MODES, RATE_LIMIT_WINDOW_MS, rateLimitResponse } from "@/lib/rate-limit";
import { applyBackchannelLogout, verifyLogoutToken } from "@/lib/staff-backchannel-logout";
import { getStaffOidcMetadata, staffOidcFetch } from "@/lib/staff-oidc";

export const dynamic = "force-dynamic";

const noStore = { "cache-control": "no-store" };
let remoteJwks: { uri: string; keys: ReturnType<typeof createRemoteJWKSet> } | null = null;

function response(status: 200 | 400 | 503) {
  // Never echo token contents (spec §6.4).
  return Response.json({}, { status, headers: noStore });
}

function jwksFor(uri: string) {
  if (remoteJwks?.uri !== uri) remoteJwks = { uri, keys: createRemoteJWKSet(new URL(uri), { [joseFetch]: staffOidcFetch, timeoutDuration: 5_000 }) };
  return remoteJwks.keys;
}

/** OpenID Connect Back-Channel Logout receiver for the studio identity provider (spec §6.4). */
export async function POST(request: Request) {
  const rate = await applyFixedWindowRateLimit({
    namespace: "oidc-logout", key: getClientIp(request), limit: 240,
    windowMs: RATE_LIMIT_WINDOW_MS, failureMode: RATE_LIMIT_FAILURE_MODES.webhook
  });
  if (rate.limited) {
    const limited = rateLimitResponse(rate);
    limited.headers.set("cache-control", "no-store");
    return limited;
  }
  let token: string;
  try {
    if (request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/x-www-form-urlencoded") return response(400);
    const reader = request.body?.getReader();
    if (!reader) return response(400);
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.length;
        if (length > 24 * 1_024) return response(400);
        chunks.push(part.value);
      }
    } finally { await reader.cancel(); }
    const values = new URLSearchParams(Buffer.concat(chunks).toString("utf8")).getAll("logout_token");
    if (values.length !== 1 || !values[0]) return response(400);
    token = values[0];
  } catch {
    return response(400);
  }

  let claims: Awaited<ReturnType<typeof verifyLogoutToken>>;
  let metadata;
  try { metadata = await getStaffOidcMetadata(); } catch { return response(503); }
  try {
    claims = await verifyLogoutToken(token, {
      issuer: metadata.issuer,
      clientId: process.env.AUTH_AUTHENTIK_ID ?? "",
      jwks: jwksFor(metadata.jwks_uri)
    });
  } catch {
    return response(400);
  }

  // Receipts and revocation commit together: a database failure remains retryable.
  try { await applyBackchannelLogout(claims); } catch {
    console.warn({ event: "staff_backchannel_revocation_unavailable" });
    return response(503);
  }
  return response(200);
}
