"use server";

import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { ActionFormState } from "@/lib/action-form-state";
import { parseStoredFormResponses, readFormResponses } from "@/lib/form-fields";
import { getPortalActionContext, isPortalRedirect } from "@/lib/portal-context";
import { PublicActionError, publicActionErrorMessage } from "@/lib/public-action-error";
import { assertActionRateLimit } from "@/lib/rate-limit";
import { canEditRegistrationAnswers, getRegistrationForm } from "@/lib/registration-form";

export async function updateRegistrationAnswers(_state: ActionFormState, formData: FormData): Promise<ActionFormState> {
  try {
    return await updateRegistrationAnswersInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function updateRegistrationAnswersInner(formData: FormData): Promise<ActionFormState> {
  const context = await getPortalActionContext("/account/registrations");
  if (isPortalRedirect(context)) return context;
  const { org, account } = context;
  await assertActionRateLimit("portal:registration-answers", `${org.id}:${account.id}`);
  const parsed = z.string().uuid().safeParse(formData.get("registrationId"));
  if (!parsed.success) throw new PublicActionError("Registration not found.");
  const where = { id: parsed.data, orgId: org.id, portalAccountId: account.id };
  const registration = await prisma.registration.findFirst({
    where, select: { status: true, formResponses: true, event: { select: { startDate: true, registrationForm: true } } }
  });
  if (!registration) throw new PublicActionError("Registration not found.");
  if (!canEditRegistrationAnswers({ status: registration.status, eventStartDate: registration.event.startDate })) {
    throw new PublicActionError("Answers can no longer be changed for this registration.");
  }
  const { questions } = getRegistrationForm(registration.event.registrationForm);
  const submitted = readFormResponses(questions, formData);
  if (!submitted.ok) throw new PublicActionError(submitted.error);
  const updated = await prisma.registration.updateMany({
    where: { ...where, status: { in: ["PENDING", "CONFIRMED"] }, event: { startDate: { gt: new Date() } } },
    data: { formResponses: { ...parseStoredFormResponses(registration.formResponses), ...submitted.responses } }
  });
  if (updated.count !== 1) throw new PublicActionError("Answers can no longer be changed for this registration.");
  revalidatePath("/[orgSlug]/account/registrations/[registrationId]", "page");
  return { redirectTo: `/account/registrations/${parsed.data}?notice=answers-saved` };
}
