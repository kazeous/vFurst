"use server";

import { requirePlatformAdmin } from "@/lib/dashboard-access";
import { deliverOrganizationInvitation } from "@/lib/organization-invitation-email";
import { assertOrganizationTransition } from "@/lib/organization-lifecycle";
import { issueOrganizationInvitation, revokeOrganizationInvitation } from "@/lib/organization-invitations";
import { Prisma, prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const lifecycleSchema = z.object({
  orgId: z.string().uuid(),
  targetStatus: z.enum(["PROVISIONING", "ACTIVE", "SUSPENDED", "RETIRED"])
});

const initialOwnerInvitationSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().trim().email()
});

export async function changeOrganizationStatus(formData: FormData) {
  const platformAdmin = await requirePlatformAdmin();
  const parsed = lifecycleSchema.safeParse({
    orgId: formData.get("orgId"),
    targetStatus: formData.get("targetStatus")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid lifecycle transition.");
  }

  const changed = await prisma.$transaction(
    async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: parsed.data.orgId },
        select: {
          id: true,
          slug: true,
          status: true,
          _count: {
            select: {
              members: {
                where: { role: "OWNER" }
              }
            }
          }
        }
      });

      if (!org) {
        throw new Error("Organization not found.");
      }

      assertOrganizationTransition({
        currentStatus: org.status,
        targetStatus: parsed.data.targetStatus,
        ownerCount: org._count.members
      });

      const update = await tx.organization.updateMany({
        where: {
          id: org.id,
          status: org.status
        },
        data: {
          status: parsed.data.targetStatus,
          statusUpdatedById: platformAdmin.id,
          statusUpdatedAt: new Date()
        }
      });

      if (update.count !== 1) {
        throw new Error("Organization status changed while this request was being processed. Please try again.");
      }

      return org;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );

  revalidatePath("/platform");
  revalidatePath("/platform/organizations");
  revalidatePath(`/platform/organizations/${changed.id}`);
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/organizations/${changed.id}`);
  revalidatePath(`/${changed.slug}`, "layout");
}

export async function resendInitialOwnerInvitation(formData: FormData) {
  const platformAdmin = await requirePlatformAdmin();
  const parsed = initialOwnerInvitationSchema.safeParse({
    orgId: formData.get("orgId"),
    email: formData.get("email")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid owner email.");
  }

  const org = await prisma.organization.findUnique({
    where: { id: parsed.data.orgId }
  });

  if (!org || org.status !== "PROVISIONING") {
    throw new Error("Initial owner invitations are available only while an organization is provisioning.");
  }

  const issued = await issueOrganizationInvitation({
    orgId: org.id,
    email: parsed.data.email,
    role: "OWNER",
    invitedById: platformAdmin.id
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
      revokedById: platformAdmin.id
    });
    console.error("Initial owner invitation delivery failed", {
      organizationId: org.id,
      invitationId: issued.invitation.id,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    throw new Error("The invitation could not be delivered.");
  }

  revalidatePath(`/platform/organizations/${org.id}`);
}
