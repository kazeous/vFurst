"use server";

import type { ActionFormState } from "@/lib/action-form-state";
import { runActionWithState } from "@/lib/action-state";
import { requireEventAccess } from "@/lib/dashboard-access";
import { parseRegistrationFormInput, toStoredRegistrationForm } from "@/lib/registration-form";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export async function saveRegistrationForm(
  _previousState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  return runActionWithState(async () => {
    const eventId = z.string().uuid().parse(formData.get("eventId"));
    const { event } = await requireEventAccess(eventId);
    const form = parseRegistrationFormInput(formData);

    await prisma.event.update({
      where: { id: event.id },
      data: { registrationForm: toStoredRegistrationForm(form) }
    });

    revalidatePath(`/dashboard/events/${event.id}/settings/registration-form`);
  }, "Registration form saved.");
}
