import {
  ORGANIZATION_INVITATION_TTL_MS,
  OrganizationInvitationError,
  assertOrganizationInvitationCanBeAccepted,
  createOrganizationInvitationCredential,
  hashOrganizationInvitationToken,
  normalizeInvitationEmail
} from "@vfurst/auth/invitations";
import { Prisma, prisma, type OrgRole } from "@vfurst/db";

export {
  ORGANIZATION_INVITATION_TTL_MS,
  OrganizationInvitationError,
  createOrganizationInvitationCredential,
  getOrganizationInvitationState,
  hashOrganizationInvitationToken,
  normalizeInvitationEmail,
  type OrganizationInvitationErrorCode
} from "@vfurst/auth/invitations";

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

      assertOrganizationInvitationCanBeAccepted(
        {
          acceptedAt: invitation.acceptedAt,
          revokedAt: invitation.revokedAt,
          expiresAt: invitation.expiresAt,
          email: invitation.email,
          organizationStatus: invitation.org.status
        },
        userEmail,
        now
      );

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
