"use server";

import { auth } from "@/lib/auth";
import { requireOrgAccess } from "@/lib/dashboard-access";
import {
  acceptOrganizationInvitation as acceptInvitation,
  OrganizationInvitationError,
  revokeOrganizationInvitation as revokeInvitation
} from "@/lib/organization-invitations";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const tokenSchema = z.string().min(32).max(128).regex(/^[A-Za-z0-9_-]+$/);

export async function acceptOrganizationInvitation(formData: FormData) {
  const token = tokenSchema.parse(formData.get("token"));
  const returnTo = `/invitations/${encodeURIComponent(token)}`;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id
    },
    select: {
      id: true,
      email: true
    }
  });

  if (!user?.email) {
    redirect(`${returnTo}?error=EMAIL_MISMATCH`);
  }

  const result = await acceptInvitation({
    token,
    userId: user.id,
    userEmail: user.email
  })
    .then((accepted) => ({ ok: true as const, accepted }))
    .catch((error: unknown) => ({
      ok: false as const,
      code: error instanceof OrganizationInvitationError ? error.code : "UNAVAILABLE"
    }));

  if (!result.ok) {
    redirect(`${returnTo}?error=${result.code}`);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/organizations/${result.accepted.orgId}`);
  redirect(`/dashboard/organizations/${result.accepted.orgId}`);
}

export async function revokeOrganizationInvitation(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const invitationId = z.string().uuid().parse(formData.get("invitationId"));
  const { userId, membership } = await requireOrgAccess(orgId, ["OWNER", "ADMIN"], { allowInactive: true });

  const invitation = await prisma.orgInvitation.findUnique({
    where: {
      id: invitationId
    },
    select: {
      orgId: true,
      role: true
    }
  });

  if (!invitation || invitation.orgId !== orgId) {
    throw new Error("Invitation not found.");
  }

  if (membership?.role === "ADMIN" && invitation.role === "OWNER") {
    throw new Error("Only an organization owner can revoke an owner invitation.");
  }

  await revokeInvitation({
    invitationId,
    orgId,
    revokedById: userId
  });
  revalidatePath(`/dashboard/organizations/${orgId}/members`);
}
