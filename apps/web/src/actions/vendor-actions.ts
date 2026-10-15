"use server";

import { getConventionOrg } from "@/lib/convention";
import { assertPortalResourceOrg, getPortalActionContext, isPortalRedirect } from "@/lib/portal-context";
import type { ActionFormState } from "@/lib/action-form-state";
import { runActionWithState } from "@/lib/action-state";
import { requireEventAccess, requireVendorApplicationAccess } from "@/lib/dashboard-access";
import { sendOrgEmail } from "@/lib/email";
import { markOrderPaid } from "@/lib/fulfillment";
import { prepareOrderCheckout } from "@/lib/payments/checkout";
import { assertPaidCheckoutAvailable } from "@/lib/payments/platform";
import { assertActionRateLimit } from "@/lib/rate-limit";
import { parseMoney } from "@/lib/registration/pricing";
import { buildObjectKey, uploadFromBuffer } from "@/lib/s3";
import { amenitySchema, boothSchema, getVendorConfig, tableTypeSchema } from "@/lib/vendor/config";
import {
  VENDOR_DOCUMENT_MAX_COUNT,
  validateVendorDocumentContents,
  validateVendorDocumentMetadata,
  validateVendorDocumentUrl
} from "@/lib/vendor/document-upload-policy";
import { PublicActionError, publicActionErrorMessage } from "@/lib/public-action-error";
import { ExpectedActionError } from "@/lib/expected-action-error";
import type { PublicFormState } from "@/lib/public-form-state";
import { prisma, type Prisma } from "@vfurst/db";
import { assertPortalAccountEmail, syncPortalAccountName } from "@/lib/portal-account";
import { revalidatePath } from "next/cache";
import { notFound, unstable_rethrow } from "next/navigation";
import { z } from "zod";

function settingsObject(settings: unknown): Record<string, unknown> {
  return settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Record<string, unknown>) : {};
}

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value == null ? {} : (value as Prisma.InputJsonValue);
}

function slugId(prefix: string, name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  return `${prefix}-${slug || crypto.randomUUID().slice(0, 8)}`;
}

function assistantsFromForm(formData: FormData) {
  const names = formData.getAll("assistantName");
  const emails = formData.getAll("assistantEmail");

  return names
    .map((name, index) => ({
      name: String(name).trim(),
      email: String(emails[index] ?? "").trim().toLowerCase()
    }))
    .filter((assistant) => assistant.name.length > 0 || assistant.email.length > 0)
    .map((assistant) =>
      z
        .object({
          name: z.string().trim().min(1),
          email: z.string().email().optional().or(z.literal(""))
        })
        .parse(assistant)
    );
}

async function filesFromForm(orgId: string, eventId: string, formData: FormData) {
  const urls = formData
    .getAll("fileUrl")
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map(validateVendorDocumentUrl);
  const uploads = formData
    .getAll("fileUpload")
    .filter((upload): upload is File => upload instanceof File && upload.size > 0);

  if (urls.length + uploads.length > VENDOR_DOCUMENT_MAX_COUNT) {
    throw new PublicActionError(`Vendor applications may have at most ${VENDOR_DOCUMENT_MAX_COUNT} files.`);
  }

  const uploadMetadata = uploads.map((upload) => ({ upload, ...validateVendorDocumentMetadata(upload) }));
  const uploadedUrls: string[] = [];

  for (const { upload, contentType, extension } of uploadMetadata) {
    const buffer = Buffer.from(await upload.arrayBuffer());
    validateVendorDocumentContents(buffer, contentType);
    const key = buildObjectKey(orgId, `events/${eventId}/vendors`, `document-${crypto.randomUUID()}.${extension}`);
    const url = await uploadFromBuffer(key, buffer, contentType);
    uploadedUrls.push(url);
  }

  return [...urls, ...uploadedUrls];
}

function vendorPlatformFee(total: number) {
  return total > 0 ? Math.ceil(total * 0.01) : 0;
}

export async function saveBoothConfig(formData: FormData) {
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const { event: authorizedEvent } = await requireEventAccess(eventId);

  const tableNames = formData.getAll("tableName");
  const tablePrices = formData.getAll("tablePrice");
  const amenityNames = formData.getAll("amenityName");
  const amenityPrices = formData.getAll("amenityPrice");
  const boothLabels = formData.getAll("boothLabel");
  const boothTableTypes = formData.getAll("boothTableType");
  const event = await prisma.event.findUniqueOrThrow({ where: { id: authorizedEvent.id } });

  const tableTypes = tableNames
    .map((name, index) => ({
      id: slugId("table", String(name)),
      name: String(name).trim(),
      price: parseMoney(tablePrices[index] ?? "0", event.currency)
    }))
    .filter((table) => table.name.length > 0)
    .map((table) => tableTypeSchema.parse(table));

  const amenities = amenityNames
    .map((name, index) => ({
      id: slugId("amenity", String(name)),
      name: String(name).trim(),
      price: parseMoney(amenityPrices[index] ?? "0", event.currency)
    }))
    .filter((amenity) => amenity.name.length > 0)
    .map((amenity) => amenitySchema.parse(amenity));

  const booths = boothLabels
    .map((label, index) => ({
      id: slugId("booth", String(label)),
      label: String(label).trim(),
      tableType: String(boothTableTypes[index] ?? "").trim() || undefined,
      status: "AVAILABLE" as const
    }))
    .filter((booth) => booth.label.length > 0)
    .map((booth) => boothSchema.parse(booth));

  const settings = settingsObject(event.settings);

  await prisma.event.update({
    where: {
      id: eventId
    },
    data: {
      settings: jsonInput({
        ...settings,
        vendorConfig: {
          tableTypes,
          amenities,
          booths
        }
      })
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/vendors/booths`);
  revalidatePath(`/${formData.get("orgSlug") ?? ""}/vendor-apply`);
}

export async function submitApplication(_previousState: PublicFormState, formData: FormData): Promise<PublicFormState> {
  try {
    return await submitApplicationInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);

    if (message) {
      return { error: message };
    }

    throw error;
  }
}

async function submitApplicationInner(formData: FormData): Promise<PublicFormState> {
  const context = await getPortalActionContext("/vendor-apply");
  if (isPortalRedirect(context)) return context;
  const parsed = z
    .object({
      orgSlug: z.string().trim().min(1),
      contactName: z.string().trim().min(1),
      contactEmail: z.string().email(),
      businessName: z.string().trim().min(2),
      website: z.string().trim().optional(),
      productDescription: z.string().trim().min(10),
      tableType: z.string().trim().optional(),
      neighborPreference: z.string().trim().optional(),
      locationPreference: z.string().trim().optional()
    })
    .safeParse({
      orgSlug: formData.get("orgSlug"),
      contactName: formData.get("contactName"),
      contactEmail: formData.get("contactEmail"),
      businessName: formData.get("businessName"),
      website: formData.get("website") || undefined,
      productDescription: formData.get("productDescription"),
      tableType: formData.get("tableType") || undefined,
      neighborPreference: formData.get("neighborPreference") || undefined,
      locationPreference: formData.get("locationPreference") || undefined
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid vendor application." };
  }

  const org = await getConventionOrg(parsed.data.orgSlug);

  if (!org) {
    throw new PublicActionError("Organization not found.");
  }
  assertPortalResourceOrg(org.id, context.org);

  const event = await prisma.event.findFirstOrThrow({
    where: {
      orgId: org.id,
      status: "PUBLISHED"
    },
    orderBy: {
      startDate: "asc"
    },
    include: {
      org: true
    }
  });
  assertPortalResourceOrg(event.orgId, context.org);
  const config = getVendorConfig(event.settings);
  const selectedTable = config.tableTypes.find((table) => table.id === parsed.data.tableType);

  if (parsed.data.tableType && !selectedTable) {
    throw new PublicActionError("The selected vendor table type does not belong to this event.");
  }

  const amenityIds = formData.getAll("amenityId").map((value) => String(value));
  const selectedAmenities = config.amenities.filter((amenity) => amenityIds.includes(amenity.id));
  const boothPrice = (selectedTable?.price ?? 0) + selectedAmenities.reduce((sum, amenity) => sum + amenity.price, 0);
  const files = await filesFromForm(event.orgId, event.id, formData);
  assertPortalAccountEmail(context.account, parsed.data.contactEmail);
  const account = await syncPortalAccountName(context.account, parsed.data.contactName);

  const application = await prisma.vendorApplication.create({
    data: {
      orgId: event.orgId,
      eventId: event.id,
      portalAccountId: account.id,
      contactName: account.name ?? parsed.data.contactName,
      contactEmail: account.email,
      businessName: parsed.data.businessName,
      website: parsed.data.website,
      productDescription: parsed.data.productDescription,
      tableType: selectedTable?.name ?? parsed.data.tableType,
      boothPrice,
      assistants: assistantsFromForm(formData),
      amenities: selectedAmenities,
      files,
      preferences: {
        neighbor: parsed.data.neighborPreference,
        location: parsed.data.locationPreference
      }
    }
  });

  return { redirectTo: `/vendor-apply?success=${application.id}` };
}

export async function approveVendor(formData: FormData) {
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const boothPriceValue = formData.get("boothPrice");
  const { vendorApplication, event } = await requireVendorApplicationAccess(applicationId);

  const application = await prisma.vendorApplication.update({
    where: {
      id: vendorApplication.id
    },
    data: {
      status: "APPROVED",
      boothPrice: boothPriceValue ? parseMoney(boothPriceValue, event.currency) : undefined
    },
    include: {
      event: true,
      org: true,
      user: true
    }
  });

  await sendOrgEmail(application.org, application.user.email, "vendor-application-decision", {
    eventName: application.event.name,
    businessName: application.businessName,
    status: "APPROVED",
    note: "Your booth is approved. Please return to the vendor application page to complete booth payment after assignment."
  }, application.event.id);

  revalidatePath(`/dashboard/events/${event.id}/vendors`);
  revalidatePath(`/dashboard/events/${event.id}/vendors/booths`);
}

export async function rejectVendor(formData: FormData) {
  await updateVendorStatus(formData, "REJECTED");
}

export async function waitlistVendor(formData: FormData) {
  await updateVendorStatus(formData, "WAITLISTED");
}

export async function bulkReviewVendors(formData: FormData) {
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const status = z.enum(["APPROVED", "REJECTED", "WAITLISTED"]).parse(formData.get("status"));
  const applicationIds = [
    ...new Set(
      z
        .array(z.string().uuid())
        .parse(
          formData
            .getAll("applicationId")
            .map((value) => String(value))
            .filter(Boolean)
        )
    )
  ];
  const { event } = await requireEventAccess(eventId);

  if (applicationIds.length === 0) {
    return;
  }

  const applications = await prisma.vendorApplication.findMany({
    where: {
      id: {
        in: applicationIds
      },
      orgId: event.orgId,
      eventId: event.id
    },
    include: {
      event: true,
      org: true,
      user: true
    }
  });

  if (applications.length !== applicationIds.length) {
    throw new Error("Every vendor application must belong to this event.");
  }

  await prisma.vendorApplication.updateMany({
    where: {
      id: {
        in: applicationIds
      },
      orgId: event.orgId,
      eventId: event.id
    },
    data: {
      status
    }
  });

  for (const application of applications) {
    await sendOrgEmail(application.org, application.user.email, "vendor-application-decision", {
      eventName: application.event.name,
      businessName: application.businessName,
      status,
      note: null
    }, application.event.id);
  }

  revalidatePath(`/dashboard/events/${event.id}/vendors`);
}

async function updateVendorStatus(formData: FormData, status: "REJECTED" | "WAITLISTED") {
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const note = String(formData.get("note") ?? "").trim();
  const { vendorApplication, event } = await requireVendorApplicationAccess(applicationId);

  const application = await prisma.vendorApplication.update({
    where: {
      id: vendorApplication.id
    },
    data: {
      status
    },
    include: {
      event: true,
      org: true,
      user: true
    }
  });

  await sendOrgEmail(application.org, application.user.email, "vendor-application-decision", {
    eventName: application.event.name,
    businessName: application.businessName,
    status,
    note
  }, application.event.id);

  revalidatePath(`/dashboard/events/${event.id}/vendors`);
}

export async function assignBooth(formData: FormData) {
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const boothId = z.string().trim().min(1).parse(formData.get("boothId"));
  const { vendorApplication, event: authorizedEvent } = await requireVendorApplicationAccess(applicationId);

  const event = await prisma.event.findUniqueOrThrow({
    where: {
      id: authorizedEvent.id
    }
  });
  const settings = settingsObject(event.settings);
  const config = getVendorConfig(event.settings);
  const booth = config.booths.find((item) => item.id === boothId);

  if (!booth) {
    throw new Error("Booth was not found.");
  }

  const updatedBooths = config.booths.map((item) => {
    if (item.vendorApplicationId === vendorApplication.id) {
      return { ...item, status: "AVAILABLE" as const, vendorApplicationId: undefined };
    }

    if (item.id === boothId) {
      return { ...item, status: "ASSIGNED" as const, vendorApplicationId: vendorApplication.id };
    }

    return item;
  });

  await prisma.$transaction([
    prisma.vendorApplication.update({
      where: {
        id: vendorApplication.id
      },
      data: {
        boothAssignment: booth.label
      }
    }),
    prisma.event.update({
      where: {
        id: event.id
      },
      data: {
        settings: jsonInput({
          ...settings,
          vendorConfig: {
            ...config,
            booths: updatedBooths
          }
        })
      }
    })
  ]);

  revalidatePath(`/dashboard/events/${event.id}/vendors`);
  revalidatePath(`/dashboard/events/${event.id}/vendors/booths`);
}

export async function addAssistant(formData: FormData) {
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const assistant = z
    .object({
      name: z.string().trim().min(1),
      email: z.string().email().optional().or(z.literal(""))
    })
    .parse({
      name: formData.get("assistantName"),
      email: formData.get("assistantEmail") || ""
    });

  const { vendorApplication, event } = await requireVendorApplicationAccess(applicationId);

  const application = await prisma.vendorApplication.findFirstOrThrow({
    where: {
      id: vendorApplication.id
    }
  });
  const assistants = Array.isArray(application.assistants) ? application.assistants : [];

  await prisma.vendorApplication.update({
    where: {
      id: application.id
    },
    data: {
      assistants: [...assistants, assistant]
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/vendors`);
}

export async function payVendorBooth(
  _previousState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  let result: ActionFormState = {};
  const state = await runActionWithState(async () => {
    result = await payVendorBoothInner(formData);
  });
  return state.error ? state : result;
}

async function payVendorBoothInner(formData: FormData): Promise<ActionFormState> {
  const context = await getPortalActionContext("/vendor-apply");
  if (isPortalRedirect(context)) return context;
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const orgSlug = z.string().trim().min(1).parse(formData.get("orgSlug"));
  await assertActionRateLimit("payment:vendor-booth", applicationId);

  const org = await getConventionOrg(orgSlug);

  if (!org) {
    throw new ExpectedActionError("Organization not found.");
  }
  assertPortalResourceOrg(org.id, context.org);

  const application = await prisma.vendorApplication.findFirst({
    where: {
      id: applicationId,
      orgId: org.id,
      portalAccountId: context.account.id,
      event: {
        status: "PUBLISHED"
      }
    },
    include: {
      event: {
        include: {
          org: true
        }
      },
      org: true
    }
  });

  if (!application || application.portalAccountId !== context.account.id) notFound();
  assertPortalResourceOrg(application.orgId, context.org);
  assertPortalResourceOrg(application.event.orgId, context.org);

  if (application.status !== "APPROVED") {
    throw new ExpectedActionError("This vendor application is not approved for payment yet.");
  }

  if (!application.boothAssignment) {
    throw new ExpectedActionError("A booth must be assigned before payment.");
  }

  if (application.boothPaidAt) {
    return { redirectTo: `/vendor-apply?success=${application.id}` };
  }

  const total = application.boothPrice;
  if (total > 0) {
    await assertPaidCheckoutAvailable(application.orgId, application.event.currency);
  }
  const order = application.paymentOrderId
    ? await prisma.order.findUnique({
        where: {
          id: application.paymentOrderId
        }
      })
    : null;

  if (order && (order.orgId !== application.orgId || order.eventId !== application.eventId || order.portalAccountId !== application.portalAccountId)) {
    throw new Error("The vendor payment order does not belong to this application.");
  }
  const payableOrder =
    order ??
    (await prisma.order.create({
      data: {
        orgId: application.orgId,
        portalAccountId: application.portalAccountId,
        eventId: application.eventId,
        total,
        platformFee: vendorPlatformFee(total),
        currency: application.event.currency,
        items: {
          create: {
            orgId: application.orgId,
            itemType: "VENDOR",
            refId: application.id,
            unitPrice: total,
            quantity: 1,
            metadata: {
              businessName: application.businessName,
              boothAssignment: application.boothAssignment
            }
          }
        }
      }
    }));

  if (!application.paymentOrderId) {
    await prisma.vendorApplication.update({
      where: {
        id: application.id
      },
      data: {
        paymentOrderId: payableOrder.id
      }
    });
  }

  if (total === 0) {
    await markOrderPaid(payableOrder.id);
    return { redirectTo: `/vendor-apply?success=${application.id}` };
  }

  const checkout = await prepareOrderCheckout(
    payableOrder.id,
    `/vendor-apply?success=${application.id}`,
    "/vendor-apply?cancelled=1"
  );
  return { redirectTo: checkout.checkoutPath };
}
