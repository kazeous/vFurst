"use server";

import { auth } from "@/lib/auth";
import { markOrderPaid } from "@/lib/fulfillment";
import { prepareOrderCheckout } from "@/lib/payments/checkout";
import { requireSafeCheckoutReturnPath } from "@/lib/payments/checkout-return-path";
import { assertPaidCheckoutAvailable } from "@/lib/payments/platform";
import { getBaseUrl } from "@/lib/payments/stripe";
import { reserveOrderInventory } from "@/lib/payments/reservations";
import { assertActionRateLimit } from "@/lib/rate-limit";
import { PublicActionError, publicActionErrorMessage } from "@/lib/public-action-error";
import type { PublicFormState } from "@/lib/public-form-state";
import { getCartSummary, parseProductOptions } from "@/lib/store/pricing";
import { prisma } from "@vfurst/db";
import type { Prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { assertOrganizationActive } from "@/lib/organization-lifecycle";

const orderItemTypes = {
  REGISTRATION: "REGISTRATION",
  ADDON: "ADDON",
  PRODUCT: "PRODUCT"
} as const;

function jsonInput(value: unknown): Prisma.InputJsonValue {
  return value == null ? {} : (value as Prisma.InputJsonValue);
}

async function requireUserId() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return session.user.id;
}

async function getOrCreateCart(userId: string, event: { id: string; orgId: string }) {
  return prisma.cart.upsert({
    where: {
      userId_eventId: {
        userId,
        eventId: event.id
      }
    },
    update: {
      orgId: event.orgId
    },
    create: {
      orgId: event.orgId,
      userId,
      eventId: event.id
    }
  });
}

function selectedOptionsFromForm(formData: FormData, options: ReturnType<typeof parseProductOptions>) {
  return Object.fromEntries(
    options.map((option) => {
      const value = String(formData.get(`option-${option.name}`) ?? "");

      if (!option.values.includes(value)) {
        throw new Error(`Choose a valid ${option.name}.`);
      }

      return [option.name, value];
    })
  );
}

export async function addToCart(_previousState: PublicFormState, formData: FormData): Promise<PublicFormState> {
  try {
    return await addToCartInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);

    if (message) {
      return { error: message };
    }

    throw error;
  }
}

async function addToCartInner(formData: FormData): Promise<PublicFormState> {
  const parsed = z
    .object({
      productId: z.string().uuid(),
      quantity: z.coerce.number().int().min(1).max(99)
    })
    .safeParse({
      productId: formData.get("productId"),
      quantity: formData.get("quantity")
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid cart item." };
  }

  const userId = await requireUserId();
  const product = await prisma.storeProduct.findUnique({
    where: {
      id: parsed.data.productId
    },
    include: {
      event: {
        include: {
          org: true
        }
      }
    }
  });

  if (!product || product.event.status !== "PUBLISHED" || product.orgId !== product.event.orgId) {
    return { error: "This product is not available for purchase." };
  }

  assertOrganizationActive(product.event.org.status);

  if (product.stock < parsed.data.quantity) {
    return { error: "Not enough inventory is available." };
  }

  const cart = await getOrCreateCart(userId, product.event);
  const options = parseProductOptions(product.options);

  await prisma.cartItem.create({
    data: {
      orgId: product.event.orgId,
      cartId: cart.id,
      itemType: "PRODUCT",
      refId: product.id,
      storeProductId: product.id,
      unitPrice: product.price,
      quantity: parsed.data.quantity,
      metadata: {
        selectedOptions: selectedOptionsFromForm(formData, options)
      }
    }
  });

  revalidatePath(`/${product.event.org.subdomain}/store`);
  revalidatePath(`/dashboard/events/${product.event.id}/store`);
  return {};
}

export async function removeFromCart(formData: FormData) {
  const userId = await requireUserId();
  const cartItemId = z.string().uuid().parse(formData.get("cartItemId"));

  await prisma.cartItem.deleteMany({
    where: {
      id: cartItemId,
      cart: {
        userId
      }
    }
  });

  revalidatePath(String(formData.get("returnPath") ?? "/"));
}

export async function updateQuantity(_previousState: PublicFormState, formData: FormData): Promise<PublicFormState> {
  try {
    return await updateQuantityInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);

    if (message) {
      return { error: message };
    }

    throw error;
  }
}

async function updateQuantityInner(formData: FormData): Promise<PublicFormState> {
  const userId = await requireUserId();
  const parsed = z
    .object({
      cartItemId: z.string().uuid(),
      quantity: z.coerce.number().int().min(1).max(99)
    })
    .safeParse({
      cartItemId: formData.get("cartItemId"),
      quantity: formData.get("quantity")
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid quantity." };
  }

  const item = await prisma.cartItem.findFirstOrThrow({
    where: {
      id: parsed.data.cartItemId,
      cart: {
        userId
      }
    },
    include: {
      product: true,
      cart: {
        select: {
          event: {
            select: {
              org: {
                select: { status: true }
              }
            }
          }
        }
      }
    }
  });

  assertOrganizationActive(item.cart.event.org.status);

  if (item.product && item.product.stock < parsed.data.quantity) {
    return { error: "Not enough inventory is available." };
  }

  await prisma.cartItem.update({
    where: {
      id: parsed.data.cartItemId
    },
    data: {
      quantity: parsed.data.quantity
    }
  });

  revalidatePath(String(formData.get("returnPath") ?? "/"));
  return {};
}

export async function clearCart(formData: FormData) {
  const userId = await requireUserId();
  const cartId = z.string().uuid().parse(formData.get("cartId"));

  const cart = await prisma.cart.findFirstOrThrow({
    where: {
      id: cartId,
      userId
    }
  });

  await prisma.cart.update({
    where: {
      id: cart.id
    },
    data: {
      voucherId: null,
      items: {
        deleteMany: {}
      }
    }
  });

  revalidatePath(String(formData.get("returnPath") ?? "/"));
}

export async function convertCartToOrder(formData: FormData) {
  const userId = await requireUserId();
  const cartId = z.string().uuid().parse(formData.get("cartId"));
  const returnPath = String(formData.get("returnPath") ?? "/store");
  const successPath = requireSafeCheckoutReturnPath(String(formData.get("successPath") ?? returnPath));
  const cancelPath = requireSafeCheckoutReturnPath(String(formData.get("cancelPath") ?? returnPath));
  await assertActionRateLimit("payment:cart-checkout", `${userId}:${cartId}`);

  const cart = await prisma.cart.findFirstOrThrow({
    where: {
      id: cartId,
      userId
    },
    include: {
      event: {
        include: {
          org: true
        }
      },
      user: true,
      items: {
        include: {
          product: true
        }
      },
      voucher: true
    }
  });

  if (cart.items.length === 0) {
    throw new PublicActionError("Your cart is empty.");
  }

  if (cart.orgId !== cart.event.orgId) {
    throw new Error("Cart tenant does not match its event.");
  }

  assertOrganizationActive(cart.event.org.status);

  for (const item of cart.items) {
    if (
      item.itemType === "PRODUCT" &&
      (!item.product || item.product.eventId !== cart.eventId || item.product.orgId !== cart.event.orgId)
    ) {
      throw new Error("A product in this cart does not belong to the cart event.");
    }

    if (item.product && item.product.stock < item.quantity) {
      throw new PublicActionError(`${item.product.name} does not have enough stock remaining.`);
    }
  }

  if (cart.voucher && (cart.voucher.eventId !== cart.eventId || cart.voucher.orgId !== cart.event.orgId)) {
    throw new Error("The voucher on this cart does not belong to the cart event.");
  }

  const summary = getCartSummary(cart.items, cart.voucher);
  if (summary.total > 0) {
    await assertPaidCheckoutAvailable(cart.event.orgId, cart.event.currency);
  }
  const order = await prisma.order.create({
    data: {
      orgId: cart.event.orgId,
      userId,
      eventId: cart.eventId,
      cartId: cart.id,
      total: summary.total,
      platformFee: summary.platformFee,
      currency: cart.event.currency,
      voucherId: cart.voucherId,
      items: {
        createMany: {
          data: cart.items.map((item) => ({
            orgId: cart.event.orgId,
            itemType: orderItemTypes[item.itemType],
            refId: item.refId,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            metadata: jsonInput(item.metadata),
            registrationId: item.itemType === "REGISTRATION" ? item.refId : getRegistrationId(item.metadata),
            storeProductId: item.itemType === "PRODUCT" ? item.refId : null
          }))
        }
      }
    }
  });

  if (summary.total === 0) {
    await markOrderPaid(order.id);
    redirect(`${successPath}?success=${order.id}`);
  }

  try {
    await reserveOrderInventory(order.id);
  } catch (error) {
    await prisma.order.delete({ where: { id: order.id } });
    throw error;
  }

  const checkout = await prepareOrderCheckout(order.id, `${successPath}?success=${order.id}`, `${cancelPath}?cancelled=1`);
  redirect(`${getBaseUrl()}${checkout.checkoutPath}`);
}

function getRegistrationId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("registrationId" in metadata)) {
    return null;
  }

  const registrationId = (metadata as { registrationId?: unknown }).registrationId;
  return typeof registrationId === "string" ? registrationId : null;
}
