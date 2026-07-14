import { createHash, randomBytes } from "node:crypto";
import { Prisma, prisma, type OrgRole } from "@vfurst/db";

export const ORGANIZATION_INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const INVITATION_TOKEN_BYTES = 32;

export type OrganizationInvitationErrorCode =
  | "ALREADY_ACCEPTED"
  | "ALREADY_MEMBER"
  | "EMAIL_MISMATCH"
  | "EXPIRED"
  | "INVALID"
  | "REVOKED"
  | "UNAVAILABLE";

export class OrganizationInvitationError extends Error {
  constructor(
    public readonly code: OrganizationInvitationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "OrganizationInvitationError";
  }
}

export function normalizeInvitationEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashOrganizationInvitationToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createOrganizationInvitationCredential() {
  const token = randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");

  return {
    token,
    tokenHash: hashOrganizationInvitationToken(token)
  };
}

type InvitationStateInput = {
  acceptedAt: Date | null;
  expiresAt: Date;
  revokedAt: Date | null;
};

export function getOrganizationInvitationState(invitation: InvitationStateInput, now = new Date()) {
  if (invitation.acceptedAt) return "ACCEPTED" as const;
  if (invitation.revokedAt) return "REVOKED" as const;
  if (invitation.expiresAt <= now) return "EXPIRED" as const;
  return "PENDING" as const;
}

type InvitationTransaction = Pick<Prisma.TransactionClient, "orgInvitation" | "orgMember">;

export async function createOrganizationInvitationRecord(
  tx: InvitationTransaction,
  input: {
    orgId: string;
    email: string;
    role: OrgRole;
    invitedById: string;
    now?: Date;
    expiresAt?: Date;
  }
) {
  const now = input.now ?? new Date();
  const expiresAt = input.expiresAt ?? new Date(now.getTime() + ORGANIZATION_INVITATION_TTL_MS);
  const email = normalizeInvitationEmail(input.email);

  if (!email || expiresAt <= now) {
    throw new OrganizationInvitationError("INVALID", "Invitation details are invalid.");
  }

  const existingMember = await tx.orgMember.findFirst({
    where: {
      orgId: input.orgId,
      user: {
        email: {
          equals: email,
          mode: "insensitive"
        }
      }
    },
    select: {
      id: true
    }
  });

  if (existingMember) {
    throw new OrganizationInvitationError("ALREADY_MEMBER", "This email already belongs to an organization member.");
  }

  await tx.orgInvitation.updateMany({
    where: {
      orgId: input.orgId,
      email,
      acceptedAt: null,
      revokedAt: null
    },
    data: {
      revokedAt: now,
      revokedById: input.invitedById
    }
  });

  const credential = createOrganizationInvitationCredential();
  const invitation = await tx.orgInvitation.create({
    data: {
      orgId: input.orgId,
      email,
      role: input.role,
      tokenHash: credential.tokenHash,
      invitedById: input.invitedById,
      expiresAt
    }
  });

  return {
    invitation,
    token: credential.token
  };
}

export async function issueOrganizationInvitation(input: {
  orgId: string;
  email: string;
  role: OrgRole;
  invitedById: string;
  now?: Date;
  expiresAt?: Date;
}) {
  return prisma.$transaction((tx) => createOrganizationInvitationRecord(tx, input), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable
  });
}

export async function getOrganizationInvitationByToken(token: string) {
  if (!token) return null;

  return prisma.orgInvitation.findUnique({
    where: {
      tokenHash: hashOrganizationInvitationToken(token)
    },
    include: {
      org: {
        select: {
          id: true,
          name: true,
          status: true
        }
      }
    }
  });
}

export async function acceptOrganizationInvitation(input: {
  token: string;
  userId: string;
  userEmail: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const tokenHash = hashOrganizationInvitationToken(input.token);
  const userEmail = normalizeInvitationEmail(input.userEmail);

  return prisma.$transaction(
    async (tx) => {
      const invitation = await tx.orgInvitation.findUnique({
        where: {
          tokenHash
        },
        select: {
          id: true,
          orgId: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          org: {
            select: {
              status: true
            }
          }
        }
      });

      if (!invitation) {
        throw new OrganizationInvitationError("INVALID", "This invitation is invalid.");
      }

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
      if (normalizeInvitationEmail(invitation.email) !== userEmail) {
        throw new OrganizationInvitationError("EMAIL_MISMATCH", "Sign in with the email address that received this invitation.");
      }
      if (invitation.org.status === "SUSPENDED" || invitation.org.status === "RETIRED") {
        throw new OrganizationInvitationError("UNAVAILABLE", "This organization is not accepting invitations.");
      }

      const claimed = await tx.orgInvitation.updateMany({
        where: {
          id: invitation.id,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: now
          }
        },
        data: {
          acceptedAt: now,
          acceptedById: input.userId
        }
      });

      if (claimed.count !== 1) {
        throw new OrganizationInvitationError("UNAVAILABLE", "This invitation is no longer available.");
      }

      const membership = await tx.orgMember.upsert({
        where: {
          userId_orgId: {
            userId: input.userId,
            orgId: invitation.orgId
          }
        },
        update: {},
        create: {
          userId: input.userId,
          orgId: invitation.orgId,
          role: invitation.role
        }
      });

      return {
        invitationId: invitation.id,
        orgId: invitation.orgId,
        membership
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );
}

export async function revokeOrganizationInvitation(input: {
  invitationId: string;
  orgId: string;
  revokedById: string;
  now?: Date;
}) {
  const revoked = await prisma.orgInvitation.updateMany({
    where: {
      id: input.invitationId,
      orgId: input.orgId,
      acceptedAt: null,
      revokedAt: null
    },
    data: {
      revokedAt: input.now ?? new Date(),
      revokedById: input.revokedById
    }
  });

  if (revoked.count !== 1) {
    throw new OrganizationInvitationError("UNAVAILABLE", "This invitation is no longer available.");
  }
}
