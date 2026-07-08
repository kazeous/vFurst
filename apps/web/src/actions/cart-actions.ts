"use server";

import { auth } from "@/lib/auth";
import { markOrderPaid } from "@/lib/fulfillment";
import { getBaseUrl, getConnectedStripeAccount, getStripe } from "@/lib/payments/stripe";
import { assertActionRateLimit } from "@/lib/rate-limit";
import { getCartSummary, parseProductOptions } from "@/lib/store/pricing";
import { prisma } from "@vfurst/db";
import type { Prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

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

async function getOrCreateCart(userId: string, orgId: string, eventId: string) {
  return prisma.cart.upsert({
    where: {
      userId_eventId: {
        userId,
        eventId
      }
    },
    update: {},
    create: {
      orgId,
      userId,
      eventId
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

export async function addToCart(formData: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      eventId: z.string().uuid(),
      productId: z.string().uuid(),
      quantity: z.coerce.number().int().min(1).max(99)
    })
    .safeParse({
      orgId: formData.get("orgId"),
      eventId: formData.get("eventId"),
      productId: formData.get("productId"),
      quantity: formData.get("quantity")
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid cart item.");
  }

  const userId = await requireUserId();
  const product = await prisma.storeProduct.findFirstOrThrow({
    where: {
      id: parsed.data.productId,
      orgId: parsed.data.orgId,
      eventId: parsed.data.eventId
    }
  });

  if (product.stock < parsed.data.quantity) {
    throw new Error("Not enough inventory is available.");
  }

  const cart = await getOrCreateCart(userId, parsed.data.orgId, parsed.data.eventId);
  const options = parseProductOptions(product.options);

  await prisma.cartItem.create({
    data: {
      orgId: parsed.data.orgId,
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

  revalidatePath(`/${formData.get("orgSlug") ?? ""}/store`);
  revalidatePath(`/dashboard/events/${parsed.data.eventId}/store`);
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

export async function updateQuantity(formData: FormData) {
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
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid quantity.");
  }

  const item = await prisma.cartItem.findFirstOrThrow({
    where: {
      id: parsed.data.cartItemId,
      cart: {
        userId
      }
    },
    include: {
      product: true
    }
  });

  if (item.product && item.product.stock < parsed.data.quantity) {
    throw new Error("Not enough inventory is available.");
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
  const successPath = String(formData.get("successPath") ?? returnPath);
  const cancelPath = String(formData.get("cancelPath") ?? returnPath);
  assertActionRateLimit("payment:cart-checkout", `${userId}:${cartId}`);

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
    throw new Error("Your cart is empty.");
  }

  for (const item of cart.items) {
    if (item.product && item.product.stock < item.quantity) {
      throw new Error(`${item.product.name} does not have enough stock remaining.`);
    }
  }

  const summary = getCartSummary(cart.items, cart.voucher);
  const order = await prisma.order.create({
    data: {
      orgId: cart.orgId,
      userId,
      eventId: cart.eventId,
      cartId: cart.id,
      total: summary.total,
      platformFee: summary.platformFee,
      voucherId: cart.voucherId,
      items: {
        createMany: {
          data: cart.items.map((item) => ({
            orgId: cart.orgId,
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

  const connectedAccountId = await getConnectedStripeAccount(cart.orgId);
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    client_reference_id: order.id,
    customer_email: cart.user.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${cart.event.name} store order`
          },
          unit_amount: summary.total
        },
        quantity: 1
      }
    ],
    payment_intent_data: {
      application_fee_amount: summary.platformFee,
      transfer_data: {
        destination: connectedAccountId
      },
      metadata: {
        orderId: order.id,
        eventId: cart.eventId,
        orgId: cart.orgId
      }
    },
    metadata: {
      orderId: order.id,
      eventId: cart.eventId,
      orgId: cart.orgId
    },
    success_url: `${getBaseUrl()}${successPath}?success=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getBaseUrl()}${cancelPath}?cancelled=1`
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }

  redirect(session.url);
}

function getRegistrationId(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("registrationId" in metadata)) {
    return null;
  }

  const registrationId = (metadata as { registrationId?: unknown }).registrationId;
  return typeof registrationId === "string" ? registrationId : null;
}
