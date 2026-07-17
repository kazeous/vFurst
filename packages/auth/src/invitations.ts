import {
  OPAQUE_TOKEN_BYTES,
  createHashedOpaqueToken,
  hashOpaqueToken,
  normalizeIdentityEmail,
  type OrganizationRole
} from "./core.js";

export const ORGANIZATION_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
export const ORGANIZATION_INVITATION_TOKEN_BYTES = OPAQUE_TOKEN_BYTES;
export const ORGANIZATION_INVITATION_TOKEN_MIN_LENGTH = 32;
export const ORGANIZATION_INVITATION_TOKEN_MAX_LENGTH = 128;

const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]+$/;

export type OrganizationInvitationErrorCode =
  | "ALREADY_ACCEPTED"
  | "ALREADY_MEMBER"
  | "EMAIL_MISMATCH"
  | "EXPIRED"
  | "INVALID"
  | "REVOKED"
  | "UNAVAILABLE";

export type OrganizationInvitationState = "ACCEPTED" | "EXPIRED" | "PENDING" | "REVOKED";
export type InvitationOrganizationStatus = "PROVISIONING" | "ACTIVE" | "SUSPENDED" | "RETIRED";

export class OrganizationInvitationError extends Error {
  constructor(
    public readonly code: OrganizationInvitationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "OrganizationInvitationError";
  }
}

export type OrganizationInvitationStateInput = Readonly<{
  acceptedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
}>;

export type OrganizationInvitationAcceptanceInput = OrganizationInvitationStateInput &
  Readonly<{
    email: string;
    organizationStatus: InvitationOrganizationStatus;
  }>;

export function normalizeInvitationEmail(email: string) {
  return normalizeIdentityEmail(email);
}

export function isValidOrganizationInvitationToken(token: string) {
  return (
    token.length >= ORGANIZATION_INVITATION_TOKEN_MIN_LENGTH &&
    token.length <= ORGANIZATION_INVITATION_TOKEN_MAX_LENGTH &&
    INVITATION_TOKEN_PATTERN.test(token)
  );
}

export function hashOrganizationInvitationToken(token: string) {
  return hashOpaqueToken(token);
}

export function createOrganizationInvitationCredential() {
  const credential = createHashedOpaqueToken(ORGANIZATION_INVITATION_TOKEN_BYTES);

  return {
    token: credential.token,
    tokenHash: credential.tokenHash
  };
}

export function getOrganizationInvitationState(invitation: OrganizationInvitationStateInput, now = new Date()) {
  if (invitation.acceptedAt) return "ACCEPTED" as const;
  if (invitation.revokedAt) return "REVOKED" as const;
  if (invitation.expiresAt <= now) return "EXPIRED" as const;
  return "PENDING" as const;
}

export function organizationAcceptsInvitations(status: InvitationOrganizationStatus) {
  return status !== "SUSPENDED" && status !== "RETIRED";
}

export function assertOrganizationInvitationCanBeAccepted(
  invitation: OrganizationInvitationAcceptanceInput,
  userEmail: string,
  now = new Date()
) {
  const state = getOrganizationInvitationState(invitation, now);

  if (state === "ACCEPTED") {
    throw new OrganizationInvitationError("ALREADY_ACCEPTED", "This invitation has already been accepted.");
  }
  if (state === "REVOKED") {
    throw new OrganizationInvitationError("REVOKED", "This invitation has been revoked.");
  }
  if (state === "EXPIRED") {
    throw new OrganizationInvitationError("EXPIRED", "This invitation has expired.");
  }
  if (normalizeInvitationEmail(invitation.email) !== normalizeInvitationEmail(userEmail)) {
    throw new OrganizationInvitationError("EMAIL_MISMATCH", "Sign in with the email address that received this invitation.");
  }
  if (!organizationAcceptsInvitations(invitation.organizationStatus)) {
    throw new OrganizationInvitationError("UNAVAILABLE", "This organization is not accepting invitations.");
  }
}

export function isInvitationRoleAllowed(
  inviterRole: OrganizationRole,
  invitedRole: OrganizationRole
) {
  if (inviterRole === "OWNER") return true;
  if (inviterRole === "ADMIN") return invitedRole !== "OWNER";
  return false;
}
