"use server";

import { auth } from "@/lib/auth";
import { sendOrgEmail } from "@/lib/email";
import { markOrderPaid } from "@/lib/fulfillment";
import { prepareOrderCheckout } from "@/lib/payments/checkout";
import { assertPaidCheckoutAvailable } from "@/lib/payments/platform";
import { assertActionRateLimit } from "@/lib/rate-limit";
import { parseMoney } from "@/lib/registration/pricing";
import { buildObjectKey, uploadFromBuffer } from "@/lib/s3";
import { amenitySchema, boothSchema, getVendorConfig, tableTypeSchema } from "@/lib/vendor/config";
import { prisma, type Prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

async function requireEventAccess(orgId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const member = await prisma.orgMember.findUnique({
    where: {
      userId_orgId: {
        userId: session.user.id,
        orgId
      }
    }
  });

  if (!member || member.role === "MEMBER") {
    throw new Error("You do not have permission to manage vendors for this event.");
  }
}

async function findOrCreateUser(email: string, name: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({
    where: {
      email: normalizedEmail
    }
  });

  if (existing) {
    if (!existing.name && name) {
      return prisma.user.update({
        where: {
          id: existing.id
        },
        data: {
          name
        }
      });
    }

    return existing;
  }

  return prisma.user.create({
    data: {
      email: normalizedEmail,
      name
    }
  });
}

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
    .filter(Boolean);
  const uploads = formData.getAll("fileUpload");
  const uploadedUrls = [];

  for (const upload of uploads) {
    if (!(upload instanceof File) || upload.size === 0) {
      continue;
    }

    const key = buildObjectKey(orgId, `events/${eventId}/vendors`, `${crypto.randomUUID()}-${upload.name}`);
    const url = await uploadFromBuffer(key, Buffer.from(await upload.arrayBuffer()), upload.type || "application/octet-stream");
    uploadedUrls.push(url);
  }

  return [...urls, ...uploadedUrls];
}

function vendorPlatformFee(total: number) {
  return total > 0 ? Math.ceil(total * 0.01) : 0;
}

export async function saveBoothConfig(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));

  await requireEventAccess(orgId);

  const tableNames = formData.getAll("tableName");
  const tablePrices = formData.getAll("tablePrice");
  const amenityNames = formData.getAll("amenityName");
  const amenityPrices = formData.getAll("amenityPrice");
  const boothLabels = formData.getAll("boothLabel");
  const boothTableTypes = formData.getAll("boothTableType");
  const event = await prisma.event.findFirstOrThrow({ where: { id: eventId, orgId } });

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

export async function submitApplication(formData: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
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
      orgId: formData.get("orgId"),
      eventId: formData.get("eventId"),
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
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid vendor application.");
  }

  const event = await prisma.event.findFirstOrThrow({
    where: {
      id: parsed.data.eventId,
      orgId: parsed.data.orgId,
      status: "PUBLISHED"
    },
    include: {
      org: true
    }
  });
  const vendor = await findOrCreateUser(parsed.data.contactEmail, parsed.data.contactName);
  const config = getVendorConfig(event.settings);
  const selectedTable = config.tableTypes.find((table) => table.id === parsed.data.tableType);
  const amenityIds = formData.getAll("amenityId").map((value) => String(value));
  const selectedAmenities = config.amenities.filter((amenity) => amenityIds.includes(amenity.id));
  const boothPrice = (selectedTable?.price ?? 0) + selectedAmenities.reduce((sum, amenity) => sum + amenity.price, 0);

  const application = await prisma.vendorApplication.create({
    data: {
      orgId: event.orgId,
      eventId: event.id,
      userId: vendor.id,
      contactName: parsed.data.contactName,
      contactEmail: parsed.data.contactEmail,
      businessName: parsed.data.businessName,
      website: parsed.data.website,
      productDescription: parsed.data.productDescription,
      tableType: selectedTable?.name ?? parsed.data.tableType,
      boothPrice,
      assistants: assistantsFromForm(formData),
      amenities: selectedAmenities,
      files: await filesFromForm(event.orgId, event.id, formData),
      preferences: {
        neighbor: parsed.data.neighborPreference,
        location: parsed.data.locationPreference
      }
    }
  });

  redirect(`/${formData.get("orgSlug")}/vendor-apply?success=${application.id}`);
}

export async function approveVendor(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const boothPriceValue = formData.get("boothPrice");

  await requireEventAccess(orgId);
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId }, select: { currency: true } });

  const application = await prisma.vendorApplication.update({
    where: {
      id: applicationId
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
  });

  revalidatePath(`/dashboard/events/${eventId}/vendors`);
  revalidatePath(`/dashboard/events/${eventId}/vendors/booths`);
}

export async function rejectVendor(formData: FormData) {
  await updateVendorStatus(formData, "REJECTED");
}

export async function waitlistVendor(formData: FormData) {
  await updateVendorStatus(formData, "WAITLISTED");
}

export async function bulkReviewVendors(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const status = z.enum(["APPROVED", "REJECTED", "WAITLISTED"]).parse(formData.get("status"));
  const applicationIds = formData
    .getAll("applicationId")
    .map((value) => String(value))
    .filter(Boolean);

  await requireEventAccess(orgId);

  if (applicationIds.length === 0) {
    return;
  }

  await prisma.vendorApplication.updateMany({
    where: {
      id: {
        in: applicationIds
      },
      orgId,
      eventId
    },
    data: {
      status
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/vendors`);
}

async function updateVendorStatus(formData: FormData, status: "REJECTED" | "WAITLISTED") {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const note = String(formData.get("note") ?? "").trim();

  await requireEventAccess(orgId);

  const application = await prisma.vendorApplication.update({
    where: {
      id: applicationId
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
  });

  revalidatePath(`/dashboard/events/${eventId}/vendors`);
}

export async function assignBooth(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  const boothId = z.string().trim().min(1).parse(formData.get("boothId"));

  await requireEventAccess(orgId);

  const event = await prisma.event.findFirstOrThrow({
    where: {
      id: eventId,
      orgId
    }
  });
  const settings = settingsObject(event.settings);
  const config = getVendorConfig(event.settings);
  const booth = config.booths.find((item) => item.id === boothId);

  if (!booth) {
    throw new Error("Booth was not found.");
  }

  const updatedBooths = config.booths.map((item) => {
    if (item.vendorApplicationId === applicationId) {
      return { ...item, status: "AVAILABLE" as const, vendorApplicationId: undefined };
    }

    if (item.id === boothId) {
      return { ...item, status: "ASSIGNED" as const, vendorApplicationId: applicationId };
    }

    return item;
  });

  await prisma.$transaction([
    prisma.vendorApplication.update({
      where: {
        id: applicationId
      },
      data: {
        boothAssignment: booth.label
      }
    }),
    prisma.event.update({
      where: {
        id: eventId
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

  revalidatePath(`/dashboard/events/${eventId}/vendors`);
  revalidatePath(`/dashboard/events/${eventId}/vendors/booths`);
}

export async function addAssistant(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
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

  await requireEventAccess(orgId);

  const application = await prisma.vendorApplication.findFirstOrThrow({
    where: {
      id: applicationId,
      orgId,
      eventId
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

  revalidatePath(`/dashboard/events/${eventId}/vendors`);
}

export async function payVendorBooth(formData: FormData) {
  const applicationId = z.string().uuid().parse(formData.get("applicationId"));
  assertActionRateLimit("payment:vendor-booth", applicationId);

  const application = await prisma.vendorApplication.findUniqueOrThrow({
    where: {
      id: applicationId
    },
    include: {
      event: {
        include: {
          org: true
        }
      },
      org: true,
      user: true
    }
  });

  if (application.status !== "APPROVED") {
    throw new Error("This vendor application is not approved for payment yet.");
  }

  if (!application.boothAssignment) {
    throw new Error("A booth must be assigned before payment.");
  }

  if (application.boothPaidAt) {
    redirect(`/${application.event.org.subdomain}/vendor-apply?success=${application.id}`);
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
  const payableOrder =
    order ??
    (await prisma.order.create({
      data: {
        orgId: application.orgId,
        userId: application.userId,
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
    redirect(`/${application.event.org.subdomain}/vendor-apply?success=${application.id}`);
  }

  const checkout = await prepareOrderCheckout(
    payableOrder.id,
    `/${application.event.org.subdomain}/vendor-apply?success=${application.id}`,
    `/${application.event.org.subdomain}/vendor-apply?cancelled=1`
  );
  redirect(checkout.checkoutPath);
}
