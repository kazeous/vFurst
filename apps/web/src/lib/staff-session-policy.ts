// Matches Pawket's privileged-session policy, approved by the owner 2026-10-19.
export const STAFF_IDP_LEASE_MS = 5 * 60_000;
export const STAFF_IDLE_MS = 30 * 60_000;
export const STAFF_PROOF_FRESH_MS = 60 * 60_000;
export const STAFF_FLOW_MS = 10 * 60_000;
export const STAFF_ASSURANCE_POLICY = "vfurst-v1";

export function staffOidcFlowCookieName(baseUrl: string) {
  // Auth.js treats every cookie starting with its session name as a JWT chunk.
  return `${new URL(baseUrl).protocol === "https:" ? "__Host-" : ""}vfurst-oidc-flow`;
}

/** Every OIDC cookie is host-only; sibling portal hosts cannot shadow state/nonce/PKCE. */
export function staffOidcCookiePolicy(baseUrl: string) {
  const secure = new URL(baseUrl).protocol === "https:";
  const cookie = (name: string, ephemeral = false) => ({
    name: `${secure ? "__Host-" : ""}vfurst-${name}`,
    options: { httpOnly: true, secure, sameSite: "lax" as const, path: "/", ...(ephemeral ? { maxAge: STAFF_FLOW_MS / 1_000 } : {}) }
  });
  return {
    sessionToken: cookie("staff"), csrfToken: cookie("csrf"), callbackUrl: cookie("callback", true),
    pkceCodeVerifier: cookie("pkce", true), state: cookie("state", true), nonce: cookie("nonce", true)
  };
}

export type StaffAssurance = {
  primaryAuthenticatedAt: Date;
  mfaVerifiedAt: Date | null;
  mfaEnrolled: boolean;
};

export class StaffIdentityError extends Error {
  constructor(readonly code: "InvalidIdentity" | "SessionRevoked" | "ActorChanged" | "AssuranceRequired" | "ProviderUnavailable") {
    super(code);
    this.name = "StaffIdentityError";
  }
}

function claimTime(value: unknown, now: Date): Date {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value * 1_000 > now.getTime()) {
    throw new StaffIdentityError("InvalidIdentity");
  }
  return new Date(value * 1_000);
}

/** Only call with signature-verified ID-token claims. Token issuance is not primary authentication. */
export function parseStaffAssurance(claims: Record<string, unknown>, now = new Date()): StaffAssurance {
  const evidence = claims.vfurst_assurance;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) throw new StaffIdentityError("AssuranceRequired");
  const proof = evidence as Record<string, unknown>;
  if (proof.version !== 1 || proof.policy !== STAFF_ASSURANCE_POLICY || typeof proof.mfa_enrolled !== "boolean" ||
    !["password", "source"].includes(String(proof.primary_method)) || proof.primary_at !== claims.auth_time) {
    throw new StaffIdentityError("AssuranceRequired");
  }
  const primaryAuthenticatedAt = claimTime(claims.auth_time, now);
  const mfaVerifiedAt = proof.mfa_at == null ? null : claimTime(proof.mfa_at, now);
  if (mfaVerifiedAt && (!proof.mfa_enrolled || mfaVerifiedAt < primaryAuthenticatedAt ||
    !Array.isArray(claims.amr) || !claims.amr.includes("mfa"))) throw new StaffIdentityError("InvalidIdentity");
  return { primaryAuthenticatedAt, mfaVerifiedAt, mfaEnrolled: proof.mfa_enrolled };
}

export function hasFreshStaffProof(proof: StaffAssurance, now = new Date()): boolean {
  return proof.mfaEnrolled && proof.mfaVerifiedAt !== null &&
    proof.primaryAuthenticatedAt <= now && proof.mfaVerifiedAt >= proof.primaryAuthenticatedAt && proof.mfaVerifiedAt <= now &&
    now.getTime() - proof.primaryAuthenticatedAt.getTime() < STAFF_PROOF_FRESH_MS &&
    now.getTime() - proof.mfaVerifiedAt.getTime() < STAFF_PROOF_FRESH_MS;
}

export function assertStaffStepUp(proof: StaffAssurance, requestedAt: Date, now = new Date()): void {
  if (!hasFreshStaffProof(proof, now) || proof.primaryAuthenticatedAt.getTime() < Math.floor(requestedAt.getTime() / 1_000) * 1_000) {
    throw new StaffIdentityError("AssuranceRequired");
  }
}
