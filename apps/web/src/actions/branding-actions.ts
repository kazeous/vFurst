"use server";

import { eventBrandingSchema, getStoredEventBranding, mergeEventBranding, type EventBranding } from "@/lib/event-branding";
import { requireEventAccess } from "@/lib/dashboard-access";
import { buildObjectKey, uploadFromBuffer } from "@/lib/s3";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
const COVER_MAX_BYTES = 6 * 1024 * 1024;

async function uploadBrandAsset(file: File, orgId: string, eventId: string, kind: "logo" | "cover", maxBytes: number) {
  if (!allowedImageTypes.has(file.type)) throw new Error("Brand images must be PNG, JPEG, or WebP files.");
  if (file.size > maxBytes) throw new Error(`${kind === "logo" ? "Logo" : "Cover"} image is too large.`);
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = buildObjectKey(orgId, `events/${eventId}/branding`, `${kind}-${crypto.randomUUID()}.${extension}`);
  return uploadFromBuffer(key, Buffer.from(await file.arrayBuffer()), file.type);
}

export async function updateEventBranding(formData: FormData) {
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  await requireEventAccess(eventId);
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { org: true }
  });

  if (!event) throw new Error("Event not found.");

  const current = getStoredEventBranding(event.settings);
  const logoFile = formData.get("logoFile");
  const coverFile = formData.get("coverFile");
  const input = eventBrandingSchema.safeParse({
    logoUrl: formData.get("logoUrl") || "",
    coverImageUrl: formData.get("coverImageUrl") || "",
    accentColor: formData.get("accentColor") || undefined
  });

  if (!input.success) throw new Error(input.error.issues[0]?.message ?? "Invalid event branding.");

  const branding: EventBranding = {
    logoUrl: formData.get("removeLogo") === "on" ? undefined : input.data.logoUrl || current.logoUrl,
    coverImageUrl: formData.get("removeCover") === "on" ? undefined : input.data.coverImageUrl || current.coverImageUrl,
    accentColor: input.data.accentColor as `#${string}` | undefined
  };

  if (logoFile instanceof File && logoFile.size > 0) {
    branding.logoUrl = await uploadBrandAsset(logoFile, event.orgId, event.id, "logo", LOGO_MAX_BYTES);
  }
  if (coverFile instanceof File && coverFile.size > 0) {
    branding.coverImageUrl = await uploadBrandAsset(coverFile, event.orgId, event.id, "cover", COVER_MAX_BYTES);
  }

  await prisma.event.update({
    where: { id: event.id },
    data: { settings: mergeEventBranding(event.settings, branding) }
  });

  const portalRoot = `/${event.org.subdomain}`;
  revalidatePath(`/dashboard/events/${event.id}/settings/branding`);
  for (const path of [portalRoot, `${portalRoot}/register`, `${portalRoot}/hotel`, `${portalRoot}/store`, `${portalRoot}/volunteer`, `${portalRoot}/vendor-apply`]) {
    revalidatePath(path);
  }
  redirect(`/dashboard/events/${event.id}/settings/branding?saved=1`);
}
