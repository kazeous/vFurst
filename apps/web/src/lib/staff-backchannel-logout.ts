import { prisma } from "@vfurst/db";
import { errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { STAFF_IDENTITY_PROVIDER } from "@/lib/staff-identity";

const BACKCHANNEL_LOGOUT_EVENT = "http://schemas.openid.net/event/backchannel-logout";
const MAX_IAT_AGE_SECONDS = 300;
const MAX_IAT_SKEW_SECONDS = 60;

export type LogoutTokenErrorCode = "signature" | "issuer" | "audience" | "iat" | "events" | "subject" | "nonce" | "jti";

export class LogoutTokenError extends Error {
  constructor(readonly code: LogoutTokenErrorCode) {
    super(`Invalid back-channel logout token (${code}).`);
    this.name = "LogoutTokenError";
  }
}

function joseErrorCode(error: unknown): LogoutTokenErrorCode {
  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.claim === "iss") return "issuer";
    if (error.claim === "aud") return "audience";
    return "iat";
  }
  if (error instanceof errors.JWTExpired) return "iat";
  return "signature";
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Validates a logout token per OpenID Connect Back-Channel Logout 1.0 (spec §6.4). */
export async function verifyLogoutToken(
  token: string,
  options: { issuer: string; clientId: string; jwks: JWTVerifyGetKey; now?: Date }
): Promise<{ sub: string | null; sid: string | null; jti: string }> {
  const now = options.now ?? new Date();
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, options.jwks, {
      issuer: options.issuer,
      audience: options.clientId,
      currentDate: now
    }));
  } catch (error) {
    throw new LogoutTokenError(joseErrorCode(error));
  }

  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const iat = payload.iat;
  if (typeof iat !== "number" || iat < nowSeconds - MAX_IAT_AGE_SECONDS || iat > nowSeconds + MAX_IAT_SKEW_SECONDS) {
    throw new LogoutTokenError("iat");
  }

  const events = payload.events;
  if (!events || typeof events !== "object" || !(BACKCHANNEL_LOGOUT_EVENT in events)) {
    throw new LogoutTokenError("events");
  }

  const sub = nonEmptyString(payload.sub);
  const sid = nonEmptyString(payload.sid);
  if (!sub && !sid) throw new LogoutTokenError("subject");
  if ("nonce" in payload) throw new LogoutTokenError("nonce");

  const jti = nonEmptyString(payload.jti);
  if (!jti) throw new LogoutTokenError("jti");

  return { sub, sid, jti };
}

/**
 * With a sid, revokes the staff sessions bound to it (and to the subject when
 * present). Without one, bumps the subject's authVersion, which invalidates
 * every session of that user.
 */
export async function applyBackchannelLogout(
  claims: { sub: string | null; sid: string | null },
  now = new Date()
): Promise<{ revokedSessions: number; authVersionBumped: boolean }> {
  if (claims.sid) {
    const revoked = await prisma.session.updateMany({
      where: {
        oidcSid: claims.sid,
        revokedAt: null,
        ...(claims.sub
          ? { user: { accounts: { some: { provider: STAFF_IDENTITY_PROVIDER, providerAccountId: claims.sub } } } }
          : {})
      },
      data: { revokedAt: now, idToken: null }
    });
    return { revokedSessions: revoked.count, authVersionBumped: false };
  }

  if (!claims.sub) return { revokedSessions: 0, authVersionBumped: false };

  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: STAFF_IDENTITY_PROVIDER, providerAccountId: claims.sub } },
    select: { userId: true }
  });
  if (!account) return { revokedSessions: 0, authVersionBumped: false };

  await prisma.user.update({ where: { id: account.userId }, data: { authVersion: { increment: 1 } } });
  return { revokedSessions: 0, authVersionBumped: true };
}
