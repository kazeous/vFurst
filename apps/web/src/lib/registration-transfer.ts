import { createHash, randomBytes } from "node:crypto";
import { getCentralAppUrl } from "@/lib/central-url";

export const REGISTRATION_TRANSFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeTransferEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createRegistrationTransferToken() {
  const rawToken = randomBytes(32).toString("base64url");
  return {
    rawToken,
    tokenHash: hashRegistrationTransferToken(rawToken),
    expiresAt: new Date(Date.now() + REGISTRATION_TRANSFER_TTL_MS)
  };
}

export function hashRegistrationTransferToken(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function getRegistrationTransferPath(requestId: string, rawToken: string) {
  return `/account/transfers/${encodeURIComponent(requestId)}?token=${encodeURIComponent(rawToken)}`;
}

export function getRegistrationTransferLandingPath(requestId: string, rawToken: string) {
  return `/transfer/${encodeURIComponent(requestId)}?token=${encodeURIComponent(rawToken)}`;
}

export function getRegistrationTransferUrl(requestId: string, rawToken: string) {
  return getCentralAppUrl(getRegistrationTransferLandingPath(requestId, rawToken));
}

export function formatTransferExpiry(expiresAt: Date) {
  return expiresAt.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }) + " UTC";
}
