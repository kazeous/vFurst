"use server";

import type { ActionFormState } from "@/lib/action-form-state";
import { syncPortalAccountName } from "@/lib/portal-account";
import { getPortalActionContext, isPortalRedirect } from "@/lib/portal-context";
import { publicActionErrorMessage } from "@/lib/public-action-error";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

export async function updatePortalProfile(
  _state: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  try {
    return await updatePortalProfileInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function updatePortalProfileInner(formData: FormData): Promise<ActionFormState> {
  const context = await getPortalActionContext("/account/profile");
  if (isPortalRedirect(context)) return context;

  const name = z.string().trim().min(1).safeParse(formData.get("name"));
  if (!name.success) return { error: "Enter your name." };

  await syncPortalAccountName(context.account, name.data);
  revalidatePath("/account");
  revalidatePath("/account/profile");
  return { success: "Profile saved." };
}
