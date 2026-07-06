import { prisma } from "@vfurst/db";
import Stripe from "stripe";

export const REGISTRATION_PLATFORM_FEE_CENTS = 100;
export const HOTEL_PLATFORM_FEE_CENTS = 100;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  return new Stripe(secretKey);
}

export function getBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function getConnectedStripeAccount(orgId: string) {
  const connect = await prisma.stripeConnect.findUnique({
    where: {
      orgId
    }
  });

  if (!connect?.stripeAccountId || !connect.onboardingComplete) {
    throw new Error("Stripe Connect onboarding must be complete before paid checkout can run.");
  }

  return connect.stripeAccountId;
}

