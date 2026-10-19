import { errors, jwtVerify, type JWTVerifyGetKey } from "jose";
import { STAFF_IDENTITY_PROVIDER } from "@/lib/staff-identity";
import { createStaffLogoutFence, hashStaffProtocolValue, staffIdentityTransaction } from "@/lib/staff-oidc-store";
import { configuredStaffIssuer } from "@/lib/staff-oidc";

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
    if (error.claim === "jti") return "jti";
    if (error.claim === "events") return "events";
    return "iat";
  }
  if (error instanceof errors.JWTExpired) return "iat";
  return "signature";
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 255 && !/\p{Cc}/u.test(value) ? value : null;
}

/** Validates a logout token per OpenID Connect Back-Channel Logout 1.0 (spec §6.4). */
export async function verifyLogoutToken(
  token: string,
  options: { issuer: string; clientId: string; jwks: JWTVerifyGetKey; now?: Date }
): Promise<{ sub: string | null; sid: string | null; jti: string; issuedAt: Date }> {
  const now = options.now ?? new Date();
  if (token.length > 16_384 || !Number.isFinite(now.getTime())) throw new LogoutTokenError("signature");
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, options.jwks, {
      issuer: options.issuer,
      audience: options.clientId,
      currentDate: now,
      algorithms: ["RS256"],
      requiredClaims: ["iss", "aud", "iat", "jti", "events"]
    }));
  } catch (error) {
    throw new LogoutTokenError(joseErrorCode(error));
  }

  const nowSeconds = Math.floor(now.getTime() / 1_000);
  const iat = payload.iat;
  if (typeof iat !== "number" || !Number.isSafeInteger(iat) || iat < nowSeconds - MAX_IAT_AGE_SECONDS || iat > nowSeconds + MAX_IAT_SKEW_SECONDS) {
    throw new LogoutTokenError("iat");
  }

  const events = payload.events;
  if (!events || typeof events !== "object" || Array.isArray(events) || !Object.hasOwn(events, BACKCHANNEL_LOGOUT_EVENT)) {
    throw new LogoutTokenError("events");
  }
  const event = (events as Record<string, unknown>)[BACKCHANNEL_LOGOUT_EVENT];
  if (!event || typeof event !== "object" || Array.isArray(event) || Object.keys(event).length !== 0) throw new LogoutTokenError("events");

  const sub = nonEmptyString(payload.sub);
  const sid = nonEmptyString(payload.sid);
  if ((payload.sub !== undefined && !sub) || (payload.sid !== undefined && !sid)) throw new LogoutTokenError("subject");
  if (!sub && !sid) throw new LogoutTokenError("subject");
  if ("nonce" in payload) throw new LogoutTokenError("nonce");

  const jti = nonEmptyString(payload.jti);
  if (!jti) throw new LogoutTokenError("jti");

  return { sub, sid, jti, issuedAt: new Date(iat * 1_000) };
}

/**
 * With a sid, revokes the staff sessions bound to it (and to the subject when
 * present). Subject logout revokes authentication events through the token's
 * issue time; delayed delivery must not terminate a newer, fresh sign-in.
 */
export async function applyBackchannelLogout(
  claims: { sub: string | null; sid: string | null; jti: string; issuedAt: Date },
  now = new Date()
): Promise<{ revokedSessions: number; authVersionBumped: boolean }> {
  const issuer = configuredStaffIssuer();
  const clientId = process.env.AUTH_AUTHENTIK_ID ?? "";
  return staffIdentityTransaction(async (tx) => {
    const receiptKey = { issuer, clientId, jtiHash: hashStaffProtocolValue(claims.jti) };
    const receipt = await tx.staffOidcLogoutReceipt.createMany({
      data: [{ ...receiptKey, expiresAt: new Date(now.getTime() + 600_000) }], skipDuplicates: true
    });
    if (receipt.count === 0) return { revokedSessions: 0, authVersionBumped: false };
    if (claims.sid || claims.sub) await createStaffLogoutFence(tx, {
      issuer, clientId, kind: claims.sid ? (claims.sub ? "sid-sub" : "sid") : "sub",
      value: claims.sid && claims.sub ? JSON.stringify([claims.sub, claims.sid]) : (claims.sid ?? claims.sub)!, revokedThrough: claims.issuedAt, now
    });
    if (claims.sid) {
      const revoked = await tx.session.updateMany({
        where: {
          oidcSid: claims.sid, oidcIssuer: issuer, oidcClientId: clientId, revokedAt: null,
          ...(claims.sub ? { user: { accounts: { some: { provider: STAFF_IDENTITY_PROVIDER, providerAccountId: claims.sub } } } } : {})
        },
        data: { revokedAt: now, idToken: null }
      });
      return { revokedSessions: revoked.count, authVersionBumped: false };
    }

    if (!claims.sub) return { revokedSessions: 0, authVersionBumped: false };
    const account = await tx.account.findUnique({
      where: { provider_providerAccountId: { provider: STAFF_IDENTITY_PROVIDER, providerAccountId: claims.sub } }, select: { userId: true }
    });
    if (!account) return { revokedSessions: 0, authVersionBumped: false };
    const revoked = await tx.session.updateMany({
      where: {
        userId: account.userId, oidcIssuer: issuer, oidcClientId: clientId, revokedAt: null,
        OR: [{ primaryAuthenticatedAt: { lte: claims.issuedAt } }, { primaryAuthenticatedAt: null }]
      },
      data: { revokedAt: now, idToken: null }
    });
    return { revokedSessions: revoked.count, authVersionBumped: false };
  });
}
