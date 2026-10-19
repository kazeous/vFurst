"use server";

import { assertPortalResourceOrg, getPortalActionContext, isPortalRedirect } from "@/lib/portal-context";
import type { ActionFormState } from "@/lib/action-form-state";
import { markOrderPaid } from "@/lib/fulfillment";
import { prepareOrderCheckout } from "@/lib/payments/checkout";
import { requireSafeCheckoutReturnPath } from "@/lib/payments/checkout-return-path";
import { assertPaidCheckoutAvailable } from "@/lib/payments/platform";
import { reserveOrderInventory } from "@/lib/payments/reservations";
import { assertActionRateLimit } from "@/lib/rate-limit";
import { PublicActionError, publicActionErrorMessage } from "@/lib/public-action-error";
import type { PublicFormState } from "@/lib/public-form-state";
import { getCartSummary, parseProductOptions } from "@/lib/store/pricing";
import { prisma } from "@vfurst/db";
import type { Prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
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

async function getOrCreateCart(portalAccountId: string, event: { id: string; orgId: string }) {
  return prisma.cart.upsert({
    where: {
      orgId: event.orgId,
      portalAccountId_eventId: {
        portalAccountId,
        eventId: event.id
      }
    },
    update: {
      orgId: event.orgId
    },
    create: {
      orgId: event.orgId,
      portalAccountId,
      eventId: event.id
    }
  });
}

function selectedOptionsFromForm(formData: FormData, options: ReturnType<typeof parseProductOptions>) {
  return Object.fromEntries(
    options.map((option) => {
      const value = String(formData.get(`option-${option.name}`) ?? "");

      if (!option.values.includes(value)) {
        throw new PublicActionError(`Choose a valid ${option.name}.`);
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
  const context = await getPortalActionContext("/store");
  if (isPortalRedirect(context)) return context;
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

  const portalAccountId = context.account.id;
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

  if (product) {
    assertPortalResourceOrg(product.orgId, context.org);
    assertPortalResourceOrg(product.event.orgId, context.org);
  }

  if (!product || product.archivedAt || product.event.status !== "PUBLISHED" || product.orgId !== product.event.orgId) {
    return { error: "This product is not available for purchase." };
  }

  assertOrganizationActive(product.event.org.status);

  if (product.stock < parsed.data.quantity) {
    return { error: "Not enough inventory is available." };
  }

  const cart = await getOrCreateCart(portalAccountId, product.event);
  assertPortalResourceOrg(cart.orgId, context.org);
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

  revalidatePath(`/dashboard/events/${product.event.id}/store`);
  return { redirectTo: "/store" };
}

export async function removeFromCart(_previousState: ActionFormState, formData: FormData): Promise<ActionFormState> {
  try {
    return await removeFromCartInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function removeFromCartInner(formData: FormData): Promise<ActionFormState> {
  const context = await getPortalActionContext("/store");
  if (isPortalRedirect(context)) return context;
  const portalAccountId = context.account.id;
  const parsedId = z.string().uuid().safeParse(formData.get("cartItemId"));
  if (!parsedId.success) return { error: "Invalid cart item." };
  const cartItemId = parsedId.data;

  await prisma.cartItem.deleteMany({
    where: {
      id: cartItemId,
      cart: {
        orgId: context.org.id,
        portalAccountId
      }
    }
  });

  return { redirectTo: "/store" };
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
  const context = await getPortalActionContext("/store");
  if (isPortalRedirect(context)) return context;
  const portalAccountId = context.account.id;
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

  const item = await prisma.cartItem.findFirst({
    where: {
      id: parsed.data.cartItemId,
      cart: {
        orgId: context.org.id,
        portalAccountId
      }
    },
    include: {
      product: true,
      cart: {
        select: {
          orgId: true,
          event: {
            select: {
              orgId: true,
              org: {
                select: { status: true }
              }
            }
          }
        }
      }
    }
  });

  if (!item) return { error: "Cart item not found." };
  assertPortalResourceOrg(item.orgId, context.org);
  assertPortalResourceOrg(item.cart.orgId, context.org);
  assertPortalResourceOrg(item.cart.event.orgId, context.org);
  assertOrganizationActive(item.cart.event.org.status);

  if (item.product?.archivedAt) {
    return { error: "This product is no longer available." };
  }

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

  return { redirectTo: "/store" };
}

export async function clearCart(_previousState: ActionFormState, formData: FormData): Promise<ActionFormState> {
  try {
    return await clearCartInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function clearCartInner(formData: FormData): Promise<ActionFormState> {
  const context = await getPortalActionContext("/store");
  if (isPortalRedirect(context)) return context;
  const portalAccountId = context.account.id;
  const parsedId = z.string().uuid().safeParse(formData.get("cartId"));
  if (!parsedId.success) return { error: "Invalid cart." };
  const cartId = parsedId.data;

  const cart = await prisma.cart.findFirst({
    where: {
      id: cartId,
      orgId: context.org.id,
      portalAccountId
    }
  });

  if (!cart) return { error: "Cart not found." };
  assertPortalResourceOrg(cart.orgId, context.org);

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

  return { redirectTo: "/store" };
}

export async function convertCartToOrder(_previousState: ActionFormState, formData: FormData): Promise<ActionFormState> {
  try {
    return await convertCartToOrderInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function convertCartToOrderInner(formData: FormData): Promise<ActionFormState> {
  const context = await getPortalActionContext("/store");
  if (isPortalRedirect(context)) return context;
  const portalAccountId = context.account.id;
  const parsedId = z.string().uuid().safeParse(formData.get("cartId"));
  if (!parsedId.success) return { error: "Invalid cart." };
  const cartId = parsedId.data;
  const returnPath = String(formData.get("returnPath") ?? "/store");
  const successPath = requireSafeCheckoutReturnPath(String(formData.get("successPath") ?? returnPath));
  const cancelPath = requireSafeCheckoutReturnPath(String(formData.get("cancelPath") ?? returnPath));
  await assertActionRateLimit("payment:cart-checkout", `${portalAccountId}:${cartId}`);

  const cart = await prisma.cart.findFirst({
    where: {
      id: cartId,
      orgId: context.org.id,
      portalAccountId
    },
    include: {
      event: {
        include: {
          org: true
        }
      },
      items: {
        include: {
          product: true
        }
      },
      voucher: true
    }
  });

  if (!cart) return { error: "Cart not found." };
  assertPortalResourceOrg(cart.orgId, context.org);
  assertPortalResourceOrg(cart.event.orgId, context.org);
  if (cart.voucher) assertPortalResourceOrg(cart.voucher.orgId, context.org);

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

    if (item.product?.archivedAt) {
      await prisma.cartItem.deleteMany({
        where: {
          id: item.id,
          cartId: cart.id
        }
      });
      throw new PublicActionError(`${item.product.name} is no longer available and was removed from your cart.`);
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
      portalAccountId,
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
    return { redirectTo: `${successPath}?success=${order.id}` };
  }

  try {
    await reserveOrderInventory(order.id);
  } catch (error) {
    await prisma.order.delete({ where: { id: order.id } });
    throw error;
  }

  const checkout = await prepareOrderCheckout(order.id, `${successPath}?success=${order.id}`, `${cancelPath}?cancelled=1`);
  return { redirectTo: checkout.checkoutPath };
}

function getRegistrationId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("registrationId" in metadata)) {
    return null;
  }

  const registrationId = (metadata as { registrationId?: unknown }).registrationId;
  return typeof registrationId === "string" ? registrationId : null;
}
