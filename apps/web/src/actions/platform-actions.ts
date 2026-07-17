"use server";

import { requirePlatformAdmin } from "@/lib/dashboard-access";
import { isCustomDomainVerified, normalizeCustomDomain } from "@/lib/custom-domain";
import { deliverOrganizationInvitation } from "@/lib/organization-invitation-email";
import { assertOrganizationTransition } from "@/lib/organization-lifecycle";
import { issueOrganizationInvitation, revokeOrganizationInvitation } from "@/lib/organization-invitations";
import { isPlatformDomain } from "@/lib/platform-hosts";
import type { ControlPlaneEvent } from "@vfurst/contracts";
import { enqueueTenantControlPlaneEvent, Prisma, prisma } from "@vfurst/db";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

type ControlPlaneEventData<T extends ControlPlaneEvent["type"]> = Extract<
  ControlPlaneEvent,
  { type: T }
>["data"];

const lifecycleSchema = z.object({
  orgId: z.string().uuid(),
  targetStatus: z.enum(["PROVISIONING", "ACTIVE", "SUSPENDED", "RETIRED"])
});

const initialOwnerInvitationSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().trim().email()
});

const customDomainOrganizationSchema = z.object({
  orgId: z.string().uuid()
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

  const eventId = randomUUID();
  const idempotencyKey = randomUUID();
  const correlationId = randomUUID();

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

      const data = {
        previousStatus: org.status,
        status: parsed.data.targetStatus
      } satisfies ControlPlaneEventData<"tenant.lifecycle-changed">;

      await enqueueTenantControlPlaneEvent(tx, {
        id: eventId,
        idempotencyKey,
        organizationId: org.id,
        eventType: "tenant.lifecycle-changed",
        correlationId,
        actorUserId: platformAdmin.id,
        data
      });

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

export async function verifyOrganizationCustomDomain(formData: FormData) {
  const platformAdmin = await requirePlatformAdmin();
  const parsed = customDomainOrganizationSchema.safeParse({
    orgId: formData.get("orgId")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid organization.");
  }

  const org = await prisma.organization.findUnique({
    where: { id: parsed.data.orgId },
    select: {
      id: true,
      requestedCustomDomain: true,
      customDomainStatus: true
    }
  });
  const domain = normalizeCustomDomain(org?.requestedCustomDomain ?? "");

  if (!org || !domain) {
    throw new Error("This organization has not requested a custom domain.");
  }
  if (org.customDomainStatus !== "PENDING_VERIFICATION") {
    throw new Error("Only a pending domain request can be verified.");
  }
  if (!domain.includes(".") || isPlatformDomain(domain)) {
    throw new Error("The requested hostname is not an eligible custom domain.");
  }
  if (!(await isCustomDomainVerified(org.id, domain))) {
    throw new Error("The required DNS ownership record is not visible yet.");
  }

  const result = await prisma.organization.updateMany({
    where: {
      id: org.id,
      requestedCustomDomain: domain,
      customDomainStatus: "PENDING_VERIFICATION"
    },
    data: {
      customDomainStatus: "VERIFIED",
      customDomainVerifiedById: platformAdmin.id,
      customDomainVerifiedAt: new Date()
    }
  });

  if (result.count !== 1) {
    throw new Error("The domain request changed while it was being verified. Please review the latest request.");
  }

  revalidatePath("/platform/domains");
  revalidatePath(`/platform/organizations/${org.id}`);
  revalidatePath(`/dashboard/organizations/${org.id}/settings`);
}

export async function activateOrganizationCustomDomain(formData: FormData) {
  const platformAdmin = await requirePlatformAdmin();
  const parsed = customDomainOrganizationSchema.safeParse({
    orgId: formData.get("orgId")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid organization.");
  }

  const eventId = randomUUID();
  const idempotencyKey = randomUUID();
  const correlationId = randomUUID();

  try {
    const activated = await prisma.$transaction(
      async (tx) => {
        const org = await tx.organization.findUnique({
          where: { id: parsed.data.orgId },
          select: {
            id: true,
            slug: true,
            status: true,
            customDomain: true,
            requestedCustomDomain: true,
            customDomainStatus: true,
            customDomainVerifiedAt: true,
            customDomainVerifiedById: true
          }
        });
        const domain = normalizeCustomDomain(org?.requestedCustomDomain ?? "");

        if (!org || !domain) {
          throw new Error("This organization has not requested a custom domain.");
        }
        if (org.status !== "ACTIVE") {
          throw new Error("Only an active organization can receive custom-domain routing.");
        }
        if (org.customDomainStatus !== "VERIFIED" || !org.customDomainVerifiedAt || !org.customDomainVerifiedById) {
          throw new Error("The platform must verify the current DNS request before activation.");
        }
        if (!domain.includes(".") || isPlatformDomain(domain)) {
          throw new Error("The requested hostname is not an eligible custom domain.");
        }

        const conflictingOrganization = await tx.organization.findFirst({
          where: {
            customDomain: domain,
            id: { not: org.id }
          },
          select: { id: true }
        });
        if (conflictingOrganization) {
          throw new Error("That custom domain is already active for another organization.");
        }

        const update = await tx.organization.updateMany({
          where: {
            id: org.id,
            status: "ACTIVE",
            requestedCustomDomain: domain,
            customDomainStatus: "VERIFIED"
          },
          data: {
            customDomain: domain,
            customDomainStatus: "ACTIVE",
            customDomainActivatedById: platformAdmin.id,
            customDomainActivatedAt: new Date()
          }
        });

        if (update.count !== 1) {
          throw new Error("The organization or domain request changed during activation. Please try again.");
        }

        const data = {
          hostname: domain,
          previousHostname: org.customDomain
        } satisfies ControlPlaneEventData<"tenant.domain-activated">;

        await enqueueTenantControlPlaneEvent(tx, {
          id: eventId,
          idempotencyKey,
          organizationId: org.id,
          eventType: "tenant.domain-activated",
          correlationId,
          actorUserId: platformAdmin.id,
          data
        });

        return {
          id: org.id,
          slug: org.slug,
          domain
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );

    revalidatePath("/platform/domains");
    revalidatePath(`/platform/organizations/${activated.id}`);
    revalidatePath(`/dashboard/organizations/${activated.id}/settings`);
    revalidatePath(`/${activated.slug}`, "layout");
    revalidatePath(`/${activated.domain}`, "layout");
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("That custom domain is already active for another organization.");
    }
    throw error;
  }
}
