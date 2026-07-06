"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@vfurst/db";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { z } from "zod";

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }

  return new Stripe(secretKey);
}

async function requireOrgOwner(orgId: string) {
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

  if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
    throw new Error("You do not have permission to manage Stripe for this organization.");
  }
}

export async function startStripeOnboarding(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  await requireOrgOwner(orgId);

  const stripe = getStripe();
  const org = await prisma.organization.findUniqueOrThrow({
    where: {
      id: orgId
    },
    include: {
      stripeConnect: true
    }
  });

  const accountId =
    org.stripeConnect?.stripeAccountId ??
    (
      await stripe.accounts.create({
        type: "express",
        email: org.contactEmail,
        capabilities: {
          card_payments: {
            requested: true
          },
          transfers: {
            requested: true
          }
        }
      })
    ).id;

  await prisma.stripeConnect.upsert({
    where: {
      orgId
    },
    update: {
      stripeAccountId: accountId
    },
    create: {
      orgId,
      stripeAccountId: accountId
    }
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/dashboard/organizations/${orgId}/stripe-connect`,
    return_url: `${baseUrl}/dashboard/organizations/${orgId}/stripe-connect?returned=1`,
    type: "account_onboarding"
  });

  redirect(accountLink.url);
}

export async function refreshStripeStatus(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  await requireOrgOwner(orgId);

  const connect = await prisma.stripeConnect.findUnique({
    where: {
      orgId
    }
  });

  if (!connect) {
    return;
  }

  const account = await getStripe().accounts.retrieve(connect.stripeAccountId);

  await prisma.stripeConnect.update({
    where: {
      orgId
    },
    data: {
      onboardingComplete: Boolean(account.details_submitted && account.charges_enabled && account.payouts_enabled)
    }
  });
}

