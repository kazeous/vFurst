"use server";

import { convertCartToOrder } from "@/actions/cart-actions";
import { auth } from "@/lib/auth";
import { dollarsToCents } from "@/lib/registration/pricing";
import { getStripe } from "@/lib/payments/stripe";
import { buildObjectKey, uploadFromBuffer } from "@/lib/s3";
import { productOptionSchema, productSurchargeSchema } from "@/lib/store/pricing";
import { prisma } from "@vfurst/db";
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
    throw new Error("You do not have permission to manage store products for this event.");
  }
}

function surchargesFromForm(formData: FormData) {
  const names = formData.getAll("surchargeName");
  const amounts = formData.getAll("surchargeAmount");

  return names
    .map((name, index) => ({
      name: String(name).trim(),
      amount: dollarsToCents(amounts[index] ?? "0")
    }))
    .filter((surcharge) => surcharge.name.length > 0)
    .map((surcharge) => productSurchargeSchema.parse(surcharge));
}

function optionsFromForm(formData: FormData) {
  const names = formData.getAll("optionName");
  const values = formData.getAll("optionValues");

  return names
    .map((name, index) => ({
      name: String(name).trim(),
      values: String(values[index] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    }))
    .filter((option) => option.name.length > 0 && option.values.length > 0)
    .map((option) => productOptionSchema.parse(option));
}

async function imagesFromForm(orgId: string, eventId: string, formData: FormData) {
  const imageUrls = formData
    .getAll("imageUrl")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const uploads = formData.getAll("imageFile");

  const uploadedUrls = [];

  for (const upload of uploads) {
    if (!(upload instanceof File) || upload.size === 0) {
      continue;
    }

    const key = buildObjectKey(orgId, `events/${eventId}/store`, `${crypto.randomUUID()}-${upload.name}`);
    const url = await uploadFromBuffer(key, Buffer.from(await upload.arrayBuffer()), upload.type || "application/octet-stream");
    uploadedUrls.push(url);
  }

  return [...imageUrls, ...uploadedUrls];
}

const productSchema = z.object({
  orgId: z.string().uuid(),
  eventId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  price: z.coerce.number().int().min(0),
  stock: z.coerce.number().int().min(0),
  category: z.string().trim().optional()
});

export async function createProduct(formData: FormData) {
  const parsed = productSchema.safeParse({
    orgId: formData.get("orgId"),
    eventId: formData.get("eventId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    price: dollarsToCents(formData.get("price")),
    stock: formData.get("stock"),
    category: formData.get("category") || undefined
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid product.");
  }

  await requireEventAccess(parsed.data.orgId);

  await prisma.storeProduct.create({
    data: {
      orgId: parsed.data.orgId,
      eventId: parsed.data.eventId,
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      stock: parsed.data.stock,
      category: parsed.data.category,
      images: await imagesFromForm(parsed.data.orgId, parsed.data.eventId, formData),
      surcharges: surchargesFromForm(formData),
      options: optionsFromForm(formData)
    }
  });

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/store`);
}

export async function updateProduct(formData: FormData) {
  const parsed = productSchema.required({ productId: true }).safeParse({
    orgId: formData.get("orgId"),
    eventId: formData.get("eventId"),
    productId: formData.get("productId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    price: dollarsToCents(formData.get("price")),
    stock: formData.get("stock"),
    category: formData.get("category") || undefined
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid product.");
  }

  await requireEventAccess(parsed.data.orgId);
  const existingImages = formData
    .getAll("existingImage")
    .map((value) => String(value).trim())
    .filter(Boolean);

  await prisma.storeProduct.update({
    where: {
      id: parsed.data.productId
    },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      stock: parsed.data.stock,
      category: parsed.data.category,
      images: [...existingImages, ...(await imagesFromForm(parsed.data.orgId, parsed.data.eventId, formData))],
      surcharges: surchargesFromForm(formData),
      options: optionsFromForm(formData)
    }
  });

  revalidatePath(`/dashboard/events/${parsed.data.eventId}/store`);
}

export async function deleteProduct(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const productId = z.string().uuid().parse(formData.get("productId"));

  await requireEventAccess(orgId);

  await prisma.storeProduct.deleteMany({
    where: {
      id: productId,
      orgId,
      eventId
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/store`);
}

export async function createOrder(formData: FormData) {
  await convertCartToOrder(formData);
}

export async function refundOrder(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const orderId = z.string().uuid().parse(formData.get("orderId"));

  await requireEventAccess(orgId);
  const order = await prisma.order.findFirstOrThrow({
    where: {
      id: orderId,
      orgId,
      eventId
    }
  });

  if (order.stripePaymentIntentId && order.total > 0) {
    await getStripe().refunds.create({
      payment_intent: order.stripePaymentIntentId
    });
  }

  await prisma.order.update({
    where: {
      id: order.id
    },
    data: {
      status: "REFUNDED"
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/store/orders`);
}

export async function partialRefund(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const orderId = z.string().uuid().parse(formData.get("orderId"));
  const amount = dollarsToCents(formData.get("amount"));

  if (amount <= 0) {
    throw new Error("Refund amount must be greater than zero.");
  }

  await requireEventAccess(orgId);
  const order = await prisma.order.findFirstOrThrow({
    where: {
      id: orderId,
      orgId,
      eventId
    }
  });

  if (!order.stripePaymentIntentId) {
    throw new Error("This order does not have a Stripe payment to refund.");
  }

  await getStripe().refunds.create({
    payment_intent: order.stripePaymentIntentId,
    amount: Math.min(amount, order.total)
  });

  await prisma.order.update({
    where: {
      id: order.id
    },
    data: {
      status: "PARTIALLY_REFUNDED"
    }
  });

  revalidatePath(`/dashboard/events/${eventId}/store/orders`);
}
