import { createHash, randomBytes } from "node:crypto";
import { formatDate } from "@/lib/i18n";
import { getPortalUrl, type PortalUrlOrganization } from "@/lib/portal-url";

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

export function getRegistrationTransferUrl(org: PortalUrlOrganization, requestId: string, rawToken: string): string {
  return getPortalUrl(org, getRegistrationTransferPath(requestId, rawToken));
}

export function formatTransferExpiry(expiresAt: Date) {
  return formatDate(expiresAt, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC"
  }) + " UTC";
}
