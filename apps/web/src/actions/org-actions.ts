"use server";

import { getCustomDomainRecords, isCustomDomainVerified, normalizeCustomDomain } from "@/lib/custom-domain";
import { auth } from "@/lib/auth";
import { isPlatformDomain } from "@/lib/platform-hosts";
import { prisma, type EmailProviderType, type OrgRole } from "@vfurst/db";
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

const createOrganizationSchema = z.object({
  name: z.string().trim().min(2),
  slug: slugSchema,
  contactEmail: z.string().trim().email(),
  logo: z.string().trim().url().optional().or(z.literal(""))
});

const updateOrganizationSchema = createOrganizationSchema.extend({
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

async function requireOrgRole(orgId: string, allowedRoles: OrgRole[] = ["OWNER", "ADMIN"]) {
  const userId = await requireUser();
  const membership = await prisma.orgMember.findUnique({
    where: {
      userId_orgId: {
        userId,
        orgId
      }
    }
  });

  if (!membership || !allowedRoles.includes(membership.role)) {
    throw new Error("You do not have permission to manage this organization.");
  }

  return {
    userId,
    membership
  };
}

export async function createOrganization(formData: FormData) {
  const userId = await requireUser();
  const parsed = createOrganizationSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    contactEmail: formData.get("contactEmail"),
    logo: formData.get("logo")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid organization details.");
  }

  const org = await prisma.organization.create({
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      subdomain: parsed.data.slug,
      contactEmail: parsed.data.contactEmail,
      logo: parsed.data.logo || null,
      members: {
        create: {
          userId,
          role: "OWNER"
        }
      }
    }
  });

  revalidatePath("/dashboard");
  redirect(`/dashboard/organizations/${org.id}`);
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

  await prisma.organization.update({
    where: {
      id: parsed.data.orgId
    },
    data: {
      customDomain: domain || null
    }
  });

  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}`);
  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}/settings`);
}

export async function verifyCustomDomain(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const domain = normalizeCustomDomain(String(formData.get("customDomain") ?? ""));

  await requireOrgRole(orgId);

  if (!domain) {
    throw new Error("Save a custom domain before verifying DNS.");
  }

  const records = getCustomDomainRecords(orgId, domain);
  const verified = await isCustomDomainVerified(orgId, domain);

  if (!verified) {
    throw new Error(`TXT record ${records.txtName} does not currently resolve to ${records.txtValue}.`);
  }

  revalidatePath(`/dashboard/organizations/${orgId}/settings`);
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

  await requireOrgRole(parsed.data.orgId);

  const user = await prisma.user.upsert({
    where: {
      email: parsed.data.email.toLowerCase()
    },
    update: {},
    create: {
      email: parsed.data.email.toLowerCase()
    }
  });

  await prisma.orgMember.upsert({
    where: {
      userId_orgId: {
        userId: user.id,
        orgId: parsed.data.orgId
      }
    },
    update: {
      role: parsed.data.role
    },
    create: {
      userId: user.id,
      orgId: parsed.data.orgId,
      role: parsed.data.role
    }
  });

  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}/members`);
}

export async function removeMember(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const memberId = z.string().uuid().parse(formData.get("memberId"));
  const { userId } = await requireOrgRole(orgId, ["OWNER"]);

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
