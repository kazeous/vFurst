"use server";

import { normalizeCustomDomain } from "@/lib/custom-domain";
import { auth } from "@/lib/auth";
import { requirePlatformAdmin } from "@/lib/dashboard-access";
import { deliverOrganizationInvitation } from "@/lib/organization-invitation-email";
import { assertOrganizationActive } from "@/lib/organization-lifecycle";
import {
  createOrganizationInvitationRecord,
  issueOrganizationInvitation,
  revokeOrganizationInvitation
} from "@/lib/organization-invitations";
import { isPlatformDomain } from "@/lib/platform-hosts";
import { Prisma, prisma, type EmailProviderType, type OrgRole } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.");

const organizationDetailsSchema = z.object({
  name: z.string().trim().min(2),
  slug: slugSchema,
  contactEmail: z.string().trim().email(),
  logo: z.string().trim().url().optional().or(z.literal(""))
});

const createOrganizationSchema = organizationDetailsSchema.extend({
  ownerEmail: z.string().trim().email()
});

const updateOrganizationSchema = organizationDetailsSchema.extend({
  orgId: z.string().uuid(),
  emailProvider: z.enum(["SES", "SMTP"]),
  smtpHost: z.string().trim().optional(),
  smtpPort: z.coerce.number().int().positive().optional(),
  smtpUser: z.string().trim().optional(),
  sesFromEmail: z.string().trim().email().optional().or(z.literal("")),
  payoutBankCode: z.string().trim().optional(),
  payoutAccountNumber: z.string().trim().optional(),
  payoutAccountHolder: z.string().trim().optional()
});

const inviteMemberSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().trim().email(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"])
});

const customDomainSchema = z.object({
  orgId: z.string().uuid(),
  customDomain: z.string().trim().optional()
});

async function requireUser() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session.user.id;
}

async function requireOrgRole(
  orgId: string,
  allowedRoles: OrgRole[] = ["OWNER", "ADMIN"],
  options: { allowInactive?: boolean } = {}
) {
  const userId = await requireUser();
  const membership = await prisma.orgMember.findUnique({
    where: {
      userId_orgId: {
        userId,
        orgId
      }
    },
    include: {
      org: {
        select: {
          status: true
        }
      }
    }
  });

  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new Error("You do not have permission to manage this organization.");
  }

  if (!options.allowInactive) {
    assertOrganizationActive(membership.org.status);
  }

  return {
    userId,
    membership
  };
}

export async function createOrganization(formData: FormData) {
  const platformAdmin = await requirePlatformAdmin();
  const parsed = createOrganizationSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    contactEmail: formData.get("contactEmail"),
    ownerEmail: formData.get("ownerEmail"),
    logo: formData.get("logo")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid organization details.");
  }

  const now = new Date();
  const provisioned = await prisma.$transaction(
    async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: parsed.data.name,
          slug: parsed.data.slug,
          subdomain: parsed.data.slug,
          status: "PROVISIONING",
          statusUpdatedById: platformAdmin.id,
          statusUpdatedAt: now,
          contactEmail: parsed.data.contactEmail.toLowerCase(),
          logo: parsed.data.logo || null
        }
      });
      const invitation = await createOrganizationInvitationRecord(tx, {
        orgId: org.id,
        email: parsed.data.ownerEmail,
        role: "OWNER",
        invitedById: platformAdmin.id,
        now
      });

      return {
        org,
        ...invitation
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );

  try {
    await deliverOrganizationInvitation({
      org: provisioned.org,
      email: provisioned.invitation.email,
      role: provisioned.invitation.role,
      token: provisioned.token,
      expiresAt: provisioned.invitation.expiresAt
    });
  } catch (error) {
    await revokeOrganizationInvitation({
      invitationId: provisioned.invitation.id,
      orgId: provisioned.org.id,
      revokedById: platformAdmin.id
    });
    console.error("Initial owner invitation delivery failed", {
      organizationId: provisioned.org.id,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw new Error("The organization was provisioned, but its owner invitation could not be delivered.");
  }

  revalidatePath("/platform");
  revalidatePath("/platform/organizations");
  redirect(`/platform/organizations/${provisioned.org.id}`);
}

export async function updateOrganization(formData: FormData) {
  const parsed = updateOrganizationSchema.safeParse({
    orgId: formData.get("orgId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    contactEmail: formData.get("contactEmail"),
    logo: formData.get("logo"),
    emailProvider: formData.get("emailProvider"),
    smtpHost: formData.get("smtpHost"),
    smtpPort: formData.get("smtpPort"),
    smtpUser: formData.get("smtpUser"),
    sesFromEmail: formData.get("sesFromEmail"),
    payoutBankCode: formData.get("payoutBankCode"),
    payoutAccountNumber: formData.get("payoutAccountNumber"),
    payoutAccountHolder: formData.get("payoutAccountHolder")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid organization settings.");
  }

  await requireOrgRole(parsed.data.orgId);

  const emailSettings =
    parsed.data.emailProvider === "SMTP"
      ? {
          host: parsed.data.smtpHost,
          port: parsed.data.smtpPort,
          user: parsed.data.smtpUser
        }
      : {
          fromEmail: parsed.data.sesFromEmail
        };

  await prisma.organization.update({
    where: {
      id: parsed.data.orgId
    },
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      subdomain: parsed.data.slug,
      contactEmail: parsed.data.contactEmail,
      logo: parsed.data.logo || null,
      emailProvider: parsed.data.emailProvider as EmailProviderType,
      emailSettings,
      payoutBankCode: parsed.data.payoutBankCode || null,
      payoutAccountNumber: parsed.data.payoutAccountNumber || null,
      payoutAccountHolder: parsed.data.payoutAccountHolder || null
    }
  });

  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}`);
  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}/settings`);
}

export async function updateCustomDomain(formData: FormData) {
  const parsed = customDomainSchema.safeParse({
    orgId: formData.get("orgId"),
    customDomain: formData.get("customDomain")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid custom domain.");
  }

  await requireOrgRole(parsed.data.orgId);

  const domain = normalizeCustomDomain(parsed.data.customDomain ?? "");

  if (domain && (!domain.includes(".") || isPlatformDomain(domain))) {
    throw new Error("Use a fully qualified custom domain that is not a vFurst platform domain.");
  }

  const org = await prisma.organization.findUnique({
    where: {
      id: parsed.data.orgId
    },
    select: {
      customDomain: true
    }
  });

  if (!org) {
    throw new Error("Organization not found.");
  }

  await prisma.organization.update({
    where: {
      id: parsed.data.orgId
    },
    data: {
      requestedCustomDomain: domain || null,
      customDomainStatus: domain ? (domain === org.customDomain ? "ACTIVE" : "PENDING_VERIFICATION") : org.customDomain ? "ACTIVE" : null,
      customDomainVerifiedAt: domain === org.customDomain ? undefined : null,
      customDomainVerifiedById: domain === org.customDomain ? undefined : null
    }
  });

  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}`);
  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}/settings`);
}

export async function inviteMember(formData: FormData) {
  const parsed = inviteMemberSchema.safeParse({
    orgId: formData.get("orgId"),
    email: formData.get("email"),
    role: formData.get("role")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid member details.");
  }

  const { userId, membership } = await requireOrgRole(parsed.data.orgId);
  if (membership.role === "ADMIN" && parsed.data.role === "OWNER") {
    throw new Error("Only an organization owner can invite another owner.");
  }

  const org = await prisma.organization.findUnique({
    where: {
      id: parsed.data.orgId
    }
  });

  if (!org) {
    throw new Error("Organization not found.");
  }

  const issued = await issueOrganizationInvitation({
    orgId: org.id,
    email: parsed.data.email,
    role: parsed.data.role,
    invitedById: userId
  });

  try {
    await deliverOrganizationInvitation({
      org,
      email: issued.invitation.email,
      role: issued.invitation.role,
      token: issued.token,
      expiresAt: issued.invitation.expiresAt
    });
  } catch (error) {
    await revokeOrganizationInvitation({
      invitationId: issued.invitation.id,
      orgId: org.id,
      revokedById: userId
    });
    console.error("Organization invitation delivery failed", {
      organizationId: org.id,
      invitationId: issued.invitation.id,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw new Error("The invitation could not be delivered. No membership was granted.");
  }

  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}/members`);
}

export async function removeMember(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const memberId = z.string().uuid().parse(formData.get("memberId"));
  const { userId } = await requireOrgRole(orgId, ["OWNER"], { allowInactive: true });

  const member = await prisma.orgMember.findUnique({
    where: {
      id: memberId
    }
  });

  if (!member || member.orgId !== orgId) {
    throw new Error("Member not found.");
  }

  if (member.userId === userId) {
    throw new Error("Owners cannot remove their own membership.");
  }

  await prisma.orgMember.delete({
    where: {
      id: memberId
    }
  });

  revalidatePath(`/dashboard/organizations/${orgId}/members`);
}
