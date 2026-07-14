"use server";

import { convertCartToOrder } from "@/actions/cart-actions";
import { requireEventAccess, requireOrderAccess, requireStoreProductAccess } from "@/lib/dashboard-access";
import { parseMoney } from "@/lib/registration/pricing";
import { getStripe } from "@/lib/payments/stripe";
import { assertActionRateLimit } from "@/lib/rate-limit";
import { buildObjectKey, uploadFromBuffer } from "@/lib/s3";
import {
  PRODUCT_IMAGE_MAX_COUNT,
  validateProductImageContents,
  validateProductImageMetadata,
  validateProductImageUrl
} from "@/lib/store/product-image-policy";
import { productOptionSchema, productSurchargeSchema } from "@/lib/store/pricing";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

function surchargesFromForm(formData: FormData, currency: "USD" | "VND") {
  const names = formData.getAll("surchargeName");
  const amounts = formData.getAll("surchargeAmount");

  return names
    .map((name, index) => ({
      name: String(name).trim(),
      amount: parseMoney(amounts[index] ?? "0", currency)
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

function storedImageUrls(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function imagesFromForm(orgId: string, eventId: string, formData: FormData, existingImageCount = 0) {
  const imageUrls = formData
    .getAll("imageUrl")
    .map((value) => String(value).trim())
    .filter(Boolean)
    .map(validateProductImageUrl);
  const uploads = formData
    .getAll("imageFile")
    .filter((upload): upload is File => upload instanceof File && upload.size > 0);
  const requestedImageCount = imageUrls.length + uploads.length;

  if (requestedImageCount > 0 && existingImageCount + requestedImageCount > PRODUCT_IMAGE_MAX_COUNT) {
    throw new Error(`Products may have at most ${PRODUCT_IMAGE_MAX_COUNT} images.`);
  }

  const uploadedUrls: string[] = [];

  for (const upload of uploads) {
    const { contentType, extension } = validateProductImageMetadata(upload);
    const buffer = Buffer.from(await upload.arrayBuffer());
    validateProductImageContents(buffer, contentType);
    const key = buildObjectKey(orgId, `events/${eventId}/store`, `product-${crypto.randomUUID()}.${extension}`);
    const url = await uploadFromBuffer(key, buffer, contentType);
    uploadedUrls.push(url);
  }

  return [...imageUrls, ...uploadedUrls];
}

const productSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().optional(),
  price: z.coerce.number().int().min(0),
  stock: z.coerce.number().int().min(0),
  category: z.string().trim().optional()
});

export async function createProduct(formData: FormData) {
  const eventId = z.string().uuid().parse(formData.get("eventId"));
  const { event } = await requireEventAccess(eventId);
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    price: parseMoney(formData.get("price"), event.currency),
    stock: formData.get("stock"),
    category: formData.get("category") || undefined
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid product.");
  }

  const surcharges = surchargesFromForm(formData, event.currency);
  const options = optionsFromForm(formData);
  const images = await imagesFromForm(event.orgId, event.id, formData);

  await prisma.storeProduct.create({
    data: {
      orgId: event.orgId,
      eventId: event.id,
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      stock: parsed.data.stock,
      category: parsed.data.category,
      images,
      surcharges,
      options
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/store`);
}

export async function updateProduct(formData: FormData) {
  const productId = z.string().uuid().parse(formData.get("productId"));
  const { storeProduct, event } = await requireStoreProductAccess(productId);
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    price: parseMoney(formData.get("price"), event.currency),
    stock: formData.get("stock"),
    category: formData.get("category") || undefined
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid product.");
  }

  const existingImages = storedImageUrls(storeProduct.images);
  const surcharges = surchargesFromForm(formData, event.currency);
  const options = optionsFromForm(formData);
  const newImages = await imagesFromForm(event.orgId, event.id, formData, existingImages.length);

  await prisma.storeProduct.update({
    where: {
      id: storeProduct.id
    },
    data: {
      orgId: event.orgId,
      name: parsed.data.name,
      description: parsed.data.description,
      price: parsed.data.price,
      stock: parsed.data.stock,
      category: parsed.data.category,
      images: [...existingImages, ...newImages],
      surcharges,
      options
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/store`);
}

export async function deleteProduct(formData: FormData) {
  const productId = z.string().uuid().parse(formData.get("productId"));
  const { storeProduct, event } = await requireStoreProductAccess(productId);

  await prisma.storeProduct.delete({
    where: {
      id: storeProduct.id
    }
  });

  revalidatePath(`/dashboard/events/${event.id}/store`);
}

export async function createOrder(formData: FormData) {
  await convertCartToOrder(formData);
}

export async function refundOrder(formData: FormData) {
  const orderId = z.string().uuid().parse(formData.get("orderId"));
  const { order, event } = await requireOrderAccess(orderId, ["OWNER", "ADMIN"], { allowInactive: true });

  assertActionRateLimit("payment:store-refund", `${event.orgId}:${order.id}`);

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

  revalidatePath(`/dashboard/events/${event.id}/store/orders`);
}

export async function partialRefund(formData: FormData) {
  const orderId = z.string().uuid().parse(formData.get("orderId"));
  const { order, event } = await requireOrderAccess(orderId, ["OWNER", "ADMIN"], { allowInactive: true });
  assertActionRateLimit("payment:store-partial-refund", `${event.orgId}:${order.id}`);
  const amount = parseMoney(formData.get("amount"), order.currency);

  if (amount <= 0) {
    throw new Error("Refund amount must be greater than zero.");
  }

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

  revalidatePath(`/dashboard/events/${event.id}/store/orders`);
}
