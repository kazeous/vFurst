import { createRemoteJWKSet } from "jose";
import { incrementSharedFixedWindow } from "@/lib/redis-rate-limit";
import { applyBackchannelLogout, verifyLogoutToken } from "@/lib/staff-backchannel-logout";
import { getStaffOidcMetadata } from "@/lib/staff-oidc";

export const dynamic = "force-dynamic";

const REPLAY_WINDOW_MS = 600_000;
const noStore = { "cache-control": "no-store" };
let remoteJwks: { uri: string; keys: ReturnType<typeof createRemoteJWKSet> } | null = null;

function response(status: 200 | 400) {
  // Never echo token contents (spec §6.4).
  return Response.json({}, { status, headers: noStore });
}

function jwksFor(uri: string) {
  if (remoteJwks?.uri !== uri) remoteJwks = { uri, keys: createRemoteJWKSet(new URL(uri)) };
  return remoteJwks.keys;
}

/** OpenID Connect Back-Channel Logout receiver for the studio identity provider (spec §6.4). */
export async function POST(request: Request) {
  let token: FormDataEntryValue | null;
  try {
    token = (await request.formData()).get("logout_token");
  } catch {
    return response(400);
  }
  if (typeof token !== "string" || !token) return response(400);

  let claims: Awaited<ReturnType<typeof verifyLogoutToken>>;
  try {
    const metadata = await getStaffOidcMetadata();
    claims = await verifyLogoutToken(token, {
      issuer: metadata.issuer,
      clientId: process.env.AUTH_AUTHENTIK_ID ?? "",
      jwks: jwksFor(metadata.jwks_uri)
    });
  } catch {
    return response(400);
  }

  try {
    const { count } = await incrementSharedFixedWindow(`oidc-logout-jti:${claims.jti}`, REPLAY_WINDOW_MS);
    if (count > 1) return response(400);
  } catch {
    // Signed-webhook policy (spec §9 S14): fail open. A replay can only revoke again.
    console.warn({ event: "oidc_backchannel_replay_check_degraded" });
  }

  await applyBackchannelLogout({ sub: claims.sub, sid: claims.sid });
  return response(200);
}
