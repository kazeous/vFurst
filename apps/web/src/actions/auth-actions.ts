"use server";

import {
  createHashedOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  normalizeIdentityEmail
} from "@vfurst/auth/core";
import { Prisma, prisma } from "@vfurst/db";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeReturnTo } from "@/lib/return-to";
import { sendPlatformEmail } from "@/lib/email";
import { assertAuthActionRateLimit } from "@/lib/rate-limit";
import { getCentralAppUrl } from "@/lib/central-url";

const registerSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("A valid email is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  returnTo: z.string().optional()
});

const resetRequestSchema = z.object({
  email: z.string().trim().email("A valid email is required"),
  returnTo: z.string().optional()
});

const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(32),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(8),
    returnTo: z.string().optional()
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"]
  });

const passwordResetPrefix = "password-reset:";
const passwordResetTtlMs = 60 * 60 * 1000;

export type RegisterUserState = {
  error?: string;
  reason?: "invalid_input" | "account_exists";
};

const accountExistsState: RegisterUserState = {
  error: "An account already exists for this email address.",
  reason: "account_exists"
};

export async function registerUser(
  _previousState: RegisterUserState,
  formData: FormData
): Promise<RegisterUserState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    returnTo: formData.get("returnTo")
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid registration details.",
      reason: "invalid_input"
    };
  }

  const email = normalizeIdentityEmail(parsed.data.email);
  const existingUser = await prisma.user.findUnique({
    where: {
      email
    },
    select: {
      id: true
    }
  });

  if (existingUser) {
    return accountExistsState;
  }

  const passwordHash = await hashPassword(parsed.data.password);

  try {
    await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return accountExistsState;
    }

    throw error;
  }

  const search = new URLSearchParams({
    registered: "1",
    returnTo: safeReturnTo(parsed.data.returnTo, "/dashboard")
  });
  redirect(`/login?${search.toString()}`);
}

export async function requestPasswordReset(formData: FormData) {
  const parsed = resetRequestSchema.safeParse({ email: formData.get("email"), returnTo: formData.get("returnTo") });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid email address.");
  }

  const email = normalizeIdentityEmail(parsed.data.email);
  await assertAuthActionRateLimit("auth:password-reset", email);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });

  if (user) {
    const identifier = `${passwordResetPrefix}${user.id}`;
    const { token: rawToken, tokenHash: token } = createHashedOpaqueToken();

    await prisma.$transaction([
      prisma.verificationToken.deleteMany({ where: { identifier } }),
      prisma.verificationToken.create({
        data: {
          identifier,
          token,
          expires: new Date(Date.now() + passwordResetTtlMs)
        }
      })
    ]);

    const resetUrl = new URL("/reset-password", getCentralAppUrl());
    resetUrl.searchParams.set("token", rawToken);
    resetUrl.searchParams.set("returnTo", safeReturnTo(parsed.data.returnTo, "/dashboard"));
    try {
      await sendPlatformEmail(user.email, "password-reset", { resetUrl: resetUrl.toString() });
    } catch (error) {
      // Keep the response indistinguishable from an unknown email address.
      console.error("Password reset email delivery failed.", error);
    }
  }

  const search = new URLSearchParams({ sent: "1", returnTo: safeReturnTo(parsed.data.returnTo, "/dashboard") });
  redirect(`/forgot-password?${search.toString()}`);
}

export async function resetPassword(formData: FormData) {
  const parsed = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    returnTo: formData.get("returnTo")
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid password reset request.");
  }

  const tokenHash = hashOpaqueToken(parsed.data.token);
  const passwordHash = await hashPassword(parsed.data.password);

  const reset = await prisma.$transaction(async (transaction) => {
    const verification = await transaction.verificationToken.findFirst({
      where: {
        token: tokenHash,
        identifier: { startsWith: passwordResetPrefix },
        expires: { gt: new Date() }
      }
    });

    if (!verification) {
      return false;
    }

    const userId = verification.identifier.slice(passwordResetPrefix.length);
    const consumed = await transaction.verificationToken.deleteMany({
      where: {
        identifier: verification.identifier,
        token: verification.token,
        expires: { gt: new Date() }
      }
    });
    if (consumed.count !== 1) {
      return false;
    }

    const user = await transaction.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      return false;
    }

    await transaction.user.update({
      where: { id: user.id },
      data: { passwordHash, emailVerified: new Date(), authVersion: { increment: 1 } }
    });
    await transaction.session.deleteMany({ where: { userId: user.id } });
    return true;
  });

  if (!reset) {
    const search = new URLSearchParams({ invalid: "1", returnTo: safeReturnTo(parsed.data.returnTo, "/dashboard") });
    redirect(`/reset-password?${search.toString()}`);
  }

  const search = new URLSearchParams({ reset: "1", returnTo: safeReturnTo(parsed.data.returnTo, "/dashboard") });
  redirect(`/login?${search.toString()}`);
}
