"use server";

import { badgeQueue } from "@/lib/badge-queue";
import { requireRegistrationAccess } from "@/lib/dashboard-access";
import { sendOrgEmail } from "@/lib/email";
import type { ActionFormState } from "@/lib/action-form-state";
import { assertPortalResourceOrg, getPortalActionContext, isPortalRedirect } from "@/lib/portal-context";
import { publicActionErrorMessage } from "@/lib/public-action-error";
import {
  assertRegistrationCapacity,
  assertTransfersAllowed,
  getRegistrationApprovalStatus,
  registrationReservationStatuses,
  runRegistrationPolicyTransaction
} from "@/lib/registration-policy";
import {
  createRegistrationTransferToken,
  formatTransferExpiry,
  getRegistrationTransferPath,
  getRegistrationTransferUrl,
  hashRegistrationTransferToken,
  normalizeTransferEmail
} from "@/lib/registration-transfer";
import { randomBytes } from "node:crypto";
import { RegistrationPolicyError } from "@/lib/registration-policy";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

const transferRequestSchema = z.object({
  registrationId: z.string().uuid(),
  recipientEmail: z.string().email(),
  recipientName: z.string().trim().max(120).optional()
});

const transferDecisionSchema = z.object({
  requestId: z.string().uuid(),
  token: z.string().min(32).max(256)
});

/** Expected decision outcomes redirect back to the decision page with a notice code instead of throwing. */
class TransferDecisionError extends Error {
  constructor(public readonly notice: "invalid" | "used" | "ineligible") {
    super("The transfer decision could not be completed.");
    this.name = "TransferDecisionError";
  }
}

function redirectWithTransferNotice(requestId: string, token: string, notice: string): ActionFormState {
  return { redirectTo: `${getRegistrationTransferPath(requestId, token)}&notice=${notice}` };
}

export async function createRegistrationTransferRequest(formData: FormData) {
  const parsed = transferRequestSchema.parse({
    registrationId: formData.get("registrationId"),
    recipientEmail: formData.get("recipientEmail") ?? formData.get("attendeeEmail"),
    recipientName: formData.get("recipientName") ?? formData.get("attendeeName") ?? undefined
  });
  const recipientEmail = normalizeTransferEmail(parsed.recipientEmail);
  const { userId: requesterUserId, registration: authorizedRegistration, event: authorizedEvent } =
    await requireRegistrationAccess(parsed.registrationId);
  assertTransfersAllowed(authorizedEvent.settings);

  const emailContext = await prisma.registration.findUniqueOrThrow({
    where: { id: authorizedRegistration.id },
    include: { event: true, org: true, portalAccount: true }
  });

  if (normalizeTransferEmail(emailContext.portalAccount.email) === recipientEmail) {
    throw new Error("Choose a different recipient email address.");
  }

  const token = createRegistrationTransferToken();
  const request = await runRegistrationPolicyTransaction(async (tx) => {
    const source = await tx.registration.findUnique({
      where: { id: authorizedRegistration.id },
      include: { event: true, portalAccount: true }
    });

    if (
      !source ||
      source.orgId !== authorizedEvent.orgId ||
      source.eventId !== authorizedEvent.id ||
      !registrationReservationStatuses.includes(source.status as (typeof registrationReservationStatuses)[number])
    ) {
      throw new Error("This registration is no longer eligible for transfer.");
    }

    assertTransfersAllowed(source.event.settings);

    if (normalizeTransferEmail(source.portalAccount.email) === recipientEmail) {
      throw new Error("Choose a different recipient email address.");
    }

    await tx.registrationTransferRequest.updateMany({
      where: { sourceRegistrationId: source.id, status: "PENDING" },
      data: { status: "CANCELLED" }
    });

    return tx.registrationTransferRequest.create({
      data: {
        orgId: source.orgId,
        eventId: source.eventId,
        sourceRegistrationId: source.id,
        requesterUserId,
        recipientEmail,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt
      }
    });
  });

  await sendOrgEmail(emailContext.org, recipientEmail, "registration-transfer", {
    eventName: emailContext.event.name,
    organizationName: emailContext.org.name,
    sourceName: emailContext.portalAccount.name ?? emailContext.portalAccount.email,
    recipientName: parsed.recipientName || null,
    transferUrl: getRegistrationTransferUrl(emailContext.org, request.id, token.rawToken),
    expiresAt: formatTransferExpiry(token.expiresAt)
  }, emailContext.event.id);

  revalidatePath(`/dashboard/events/${authorizedEvent.id}/registrations`);
  revalidatePath(`/dashboard/events/${authorizedEvent.id}/registrations/${authorizedRegistration.id}`);
  revalidatePath(`/dashboard/events/${authorizedEvent.id}/registrations/transfers`);
}

export async function cancelRegistrationTransferRequest(formData: FormData) {
  const requestId = z.string().uuid().parse(formData.get("requestId"));
  const request = await prisma.registrationTransferRequest.findUnique({
    where: { id: requestId },
    select: { id: true, eventId: true, sourceRegistrationId: true, status: true }
  });

  if (!request) {
    throw new Error("Transfer request not found.");
  }

  await requireRegistrationAccess(request.sourceRegistrationId);
  await prisma.registrationTransferRequest.updateMany({
    where: { id: request.id, status: "PENDING" },
    data: { status: "CANCELLED" }
  });

  revalidatePath(`/dashboard/events/${request.eventId}/registrations/transfers`);
}

export async function acceptRegistrationTransfer(_state: ActionFormState, formData: FormData): Promise<ActionFormState> {
  const parsed = transferDecisionSchema.safeParse({
    requestId: formData.get("requestId"),
    token: formData.get("token")
  });
  if (!parsed.success) return { error: "This transfer invitation is invalid." };

  try {
    return await acceptRegistrationTransferInner(parsed.data);
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof TransferDecisionError) {
      return redirectWithTransferNotice(parsed.data.requestId, parsed.data.token, error.notice);
    }

    if (error instanceof RegistrationPolicyError) {
      return redirectWithTransferNotice(parsed.data.requestId, parsed.data.token, "policy");
    }

    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function acceptRegistrationTransferInner(parsed: { requestId: string; token: string }): Promise<ActionFormState> {
  const context = await getPortalActionContext(getRegistrationTransferPath(parsed.requestId, parsed.token));
  if (isPortalRedirect(context)) return context;
  const { account } = context;
  const tokenHash = hashRegistrationTransferToken(parsed.token);
  const now = new Date();

  const result = await runRegistrationPolicyTransaction(async (tx) => {
    const request = await tx.registrationTransferRequest.findUnique({
      where: { id: parsed.requestId },
      include: {
        event: true,
        sourceRegistration: {
          include: { addOns: true, badges: true, portalAccount: true }
        }
      }
    });
    if (request) assertPortalResourceOrg(request.orgId, context.org);

    if (
      !request ||
      request.status !== "PENDING" ||
      request.tokenHash !== tokenHash ||
      normalizeTransferEmail(request.recipientEmail) !== normalizeTransferEmail(account.email)
    ) {
      throw new TransferDecisionError("invalid");
    }

    if (request.expiresAt <= now) {
      await tx.registrationTransferRequest.updateMany({
        where: { id: request.id, orgId: context.org.id, recipientEmail: normalizeTransferEmail(account.email), status: "PENDING" },
        data: { status: "EXPIRED" }
      });
      return { kind: "expired" as const };
    }

    const source = request.sourceRegistration;
    if (
      source.orgId !== request.orgId ||
      source.eventId !== request.eventId ||
      source.portalAccountId === account.id ||
      !registrationReservationStatuses.includes(source.status as (typeof registrationReservationStatuses)[number])
    ) {
      throw new TransferDecisionError("ineligible");
    }

    assertTransfersAllowed(request.event.settings);
    await assertRegistrationCapacity(tx, {
      eventId: request.eventId,
      portalAccountId: account.id,
      typeId: source.typeId,
      excludeRegistrationId: source.id,
      enforceUserLimit: true
    });

    const moved = await tx.registration.updateMany({
      where: {
        id: source.id,
        orgId: request.orgId,
        portalAccountId: source.portalAccountId,
        eventId: request.eventId,
        status: { in: [...registrationReservationStatuses] }
      },
      data: { status: "TRANSFERRED", badgeNumber: null }
    });

    if (moved.count !== 1) {
      throw new Error("This registration is no longer eligible for transfer.");
    }

    const registration = await tx.registration.create({
      data: {
        orgId: request.orgId,
        eventId: request.eventId,
        portalAccountId: account.id,
        typeId: source.typeId,
        status: "CONFIRMED",
        approvalStatus: getRegistrationApprovalStatus(request.event.settings, "TRANSFER"),
        badgeNumber: source.badgeNumber,
        transferredFromId: source.id
      }
    });

    await tx.registrationAddOn.updateMany({
      where: { registrationId: source.id, orgId: request.orgId },
      data: { registrationId: registration.id }
    });

    const badgeJobs: Array<{ id: string; templateId: string }> = [];
    for (const badge of source.badges) {
      const changed = await tx.badge.update({
        where: { id: badge.id },
        data: {
          registrationId: registration.id,
          barcodeData: `VF-${registration.id}-${randomBytes(8).toString("hex")}`,
          nfcTag: null,
          pdfUrl: null,
          zplData: null,
          generatedAt: null,
          printedAt: null
        },
        select: { id: true, templateId: true }
      });
      badgeJobs.push(changed);
    }

    const consumed = await tx.registrationTransferRequest.updateMany({
      where: { id: request.id, orgId: context.org.id, recipientEmail: normalizeTransferEmail(account.email), status: "PENDING", tokenHash },
      data: {
        status: "ACCEPTED",
        recipientAccountId: account.id,
        acceptedAt: now
      }
    });

    if (consumed.count !== 1) {
      throw new TransferDecisionError("used");
    }

    return {
      kind: "accepted" as const,
      orgId: request.orgId,
      eventId: request.eventId,
      sourceRegistrationId: source.id,
      registrationId: registration.id,
      badgeJobs
    };
  });

  if (result.kind === "expired") {
    return redirectWithTransferNotice(parsed.requestId, parsed.token, "expired");
  }

  for (const badge of result.badgeJobs) {
    try {
      await badgeQueue.add("generate-badges", {
        orgId: result.orgId,
        eventId: result.eventId,
        templateId: badge.templateId,
        badgeIds: [badge.id]
      });
    } catch {
      // The invalidated badge stays pending and can be regenerated from the event badge queue.
    }
  }

  revalidatePath(`/dashboard/events/${result.eventId}/registrations`);
  revalidatePath(`/dashboard/events/${result.eventId}/registrations/${result.sourceRegistrationId}`);
  revalidatePath(`/dashboard/events/${result.eventId}/registrations/transfers`);
  return redirectWithTransferNotice(parsed.requestId, parsed.token, "accepted");
}

export async function declineRegistrationTransfer(_state: ActionFormState, formData: FormData): Promise<ActionFormState> {
  const parsed = transferDecisionSchema.safeParse({
    requestId: formData.get("requestId"),
    token: formData.get("token")
  });
  if (!parsed.success) return { error: "This transfer invitation is invalid." };

  try {
    return await declineRegistrationTransferInner(parsed.data);
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof TransferDecisionError) {
      return redirectWithTransferNotice(parsed.data.requestId, parsed.data.token, error.notice);
    }

    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function declineRegistrationTransferInner(parsed: { requestId: string; token: string }): Promise<ActionFormState> {
  const context = await getPortalActionContext(getRegistrationTransferPath(parsed.requestId, parsed.token));
  if (isPortalRedirect(context)) return context;
  const { account } = context;
  const tokenHash = hashRegistrationTransferToken(parsed.token);
  const now = new Date();

  const request = await runRegistrationPolicyTransaction(async (tx) => {
    const current = await tx.registrationTransferRequest.findUnique({ where: { id: parsed.requestId } });
    if (current) assertPortalResourceOrg(current.orgId, context.org);

    if (
      !current ||
      current.status !== "PENDING" ||
      current.tokenHash !== tokenHash ||
      normalizeTransferEmail(current.recipientEmail) !== normalizeTransferEmail(account.email)
    ) {
      throw new TransferDecisionError("invalid");
    }

    if (current.expiresAt <= now) {
      await tx.registrationTransferRequest.updateMany({
        where: { id: current.id, orgId: context.org.id, recipientEmail: normalizeTransferEmail(account.email), status: "PENDING" },
        data: { status: "EXPIRED" }
      });
      return { kind: "expired" as const, eventId: current.eventId };
    }

    const declined = await tx.registrationTransferRequest.updateMany({
      where: { id: current.id, orgId: context.org.id, recipientEmail: normalizeTransferEmail(account.email), status: "PENDING", tokenHash },
      data: { status: "DECLINED", recipientAccountId: account.id, declinedAt: now }
    });

    if (declined.count !== 1) {
      throw new TransferDecisionError("used");
    }

    return { kind: "declined" as const, eventId: current.eventId };
  });

  if (request.kind === "expired") {
    revalidatePath(`/dashboard/events/${request.eventId}/registrations/transfers`);
    return redirectWithTransferNotice(parsed.requestId, parsed.token, "expired");
  }

  revalidatePath(`/dashboard/events/${request.eventId}/registrations/transfers`);
  return redirectWithTransferNotice(parsed.requestId, parsed.token, "declined");
}
