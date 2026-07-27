import { createCheckoutToken, verifyCheckoutToken } from "@/lib/payments/checkout-token";
import { requireSafeCheckoutReturnPath } from "@/lib/payments/checkout-return-path";
import { prisma } from "@vfurst/db";

export const CHECKOUT_TTL_MS = 30 * 60 * 1000;

export async function prepareOrderCheckout(orderId: string, successPath: string, cancelPath: string) {
  const { token, hash } = createCheckoutToken();
  const expiresAt = new Date(Date.now() + CHECKOUT_TTL_MS);

  await prisma.order.update({
    where: {
      id: orderId
    },
    data: {
      checkoutTokenHash: hash,
      checkoutSuccessPath: requireSafeCheckoutReturnPath(successPath),
      checkoutCancelPath: requireSafeCheckoutReturnPath(cancelPath),
      checkoutExpiresAt: expiresAt
    }
  });

  return {
    token,
    expiresAt,
    checkoutPath: `/checkout/${orderId}?token=${encodeURIComponent(token)}`
  };
}

export async function requireCheckoutOrder(orderId: string, token: string) {
  const order = await prisma.order.findUnique({
    where: {
      id: orderId
    },
    include: {
      event: true,
      org: {
        include: {
          stripeConnect: true
        }
      },
      items: true,
      paymentAttempts: {
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!order || !verifyCheckoutToken(token, order.checkoutTokenHash)) {
    throw new Error("Invalid or expired checkout link.");
  }

  if (order.status === "PENDING" && order.checkoutExpiresAt && order.checkoutExpiresAt <= new Date()) {
    throw new Error("Invalid or expired checkout link.");
  }

  return order;
}
