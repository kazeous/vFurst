"use server";

import { normalizeIdentityEmail } from "@vfurst/auth/core";
import { headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { endPortalSession, startPortalSession } from "@/lib/portal-account";
import {
  authenticatePortalAccount,
  requestPortalAccountSetup,
  requestPortalPasswordReset,
  setPortalAccountPassword
} from "@/lib/portal-accounts";
import { getRequestPortalOrg } from "@/lib/portal-request";
import { publicActionErrorMessage } from "@/lib/public-action-error";
import { assertAuthActionRateLimit, getClientIpFromHeaders } from "@/lib/rate-limit";
import { safeReturnTo } from "@/lib/return-to";

export type PortalAuthFormState = { error?: string; sent?: boolean };

const noTenantError = "Open this page from the convention's portal address.";
const invalidLinkError = "This link is invalid, expired, or has already been used.";
const rateLimitMessage = "Too many attempts. Please wait a minute and try again.";
const emailSchema = z.string().trim().email("A valid email is required");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters");
const signInSchema = z.object({ email: emailSchema, password: passwordSchema });
const setPasswordSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  password: passwordSchema
});

function field(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

async function assertPortalAuthRateLimit(namespace: string, orgId: string, email: string): Promise<void> {
  const ip = getClientIpFromHeaders(await headers());
  await assertAuthActionRateLimit(namespace, `${orgId}:${ip}`, rateLimitMessage);
  await assertAuthActionRateLimit(namespace, `${orgId}:${email}`, rateLimitMessage);
}

export async function portalSignIn(_previousState: PortalAuthFormState, formData: FormData): Promise<PortalAuthFormState> {
  try {
    return await portalSignInInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function portalSignInInner(formData: FormData): Promise<PortalAuthFormState> {
  const org = await getRequestPortalOrg();
  if (!org) return { error: noTenantError };

  const parsed = signInSchema.safeParse({ email: field(formData, "email"), password: field(formData, "password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const email = normalizeIdentityEmail(parsed.data.email);
  await assertPortalAuthRateLimit("portal-login", org.id, email);
  const account = await authenticatePortalAccount({ orgId: org.id, email, password: parsed.data.password });
  if (!account) return { error: "Email or password is incorrect." };

  await startPortalSession(account);
  redirect(safeReturnTo(field(formData, "returnTo"), "/"));
}

export async function portalSignUp(_previousState: PortalAuthFormState, formData: FormData): Promise<PortalAuthFormState> {
  try {
    return await portalSignUpInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function portalSignUpInner(formData: FormData): Promise<PortalAuthFormState> {
  const org = await getRequestPortalOrg();
  if (!org) return { error: noTenantError };

  const parsed = emailSchema.safeParse(field(formData, "email"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const email = normalizeIdentityEmail(parsed.data);
  await assertPortalAuthRateLimit("portal-signup", org.id, email);
  await requestPortalAccountSetup({ org, email, returnTo: safeReturnTo(field(formData, "returnTo"), "/") });
  return { sent: true };
}

export async function portalRequestPasswordReset(
  _previousState: PortalAuthFormState,
  formData: FormData
): Promise<PortalAuthFormState> {
  try {
    return await portalRequestPasswordResetInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function portalRequestPasswordResetInner(formData: FormData): Promise<PortalAuthFormState> {
  const org = await getRequestPortalOrg();
  if (!org) return { error: noTenantError };

  const parsed = emailSchema.safeParse(field(formData, "email"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const email = normalizeIdentityEmail(parsed.data);
  await assertPortalAuthRateLimit("portal-reset", org.id, email);
  await requestPortalPasswordReset({ org, email, returnTo: "/" });
  return { sent: true };
}

export async function portalSetPassword(
  _previousState: PortalAuthFormState,
  formData: FormData
): Promise<PortalAuthFormState> {
  try {
    return await portalSetPasswordInner(formData);
  } catch (error) {
    unstable_rethrow(error);
    const message = publicActionErrorMessage(error);
    if (message) return { error: message };
    throw error;
  }
}

async function portalSetPasswordInner(formData: FormData): Promise<PortalAuthFormState> {
  const org = await getRequestPortalOrg();
  if (!org) return { error: noTenantError };

  const parsed = setPasswordSchema.safeParse({ name: field(formData, "name"), password: field(formData, "password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (parsed.data.password !== field(formData, "confirmPassword")) return { error: "Passwords do not match." };

  const account = await setPortalAccountPassword({
    orgId: org.id,
    token: field(formData, "token"),
    name: parsed.data.name,
    password: parsed.data.password
  });
  if (!account) return { error: invalidLinkError };

  await startPortalSession(account);
  redirect(safeReturnTo(field(formData, "returnTo"), "/"));
}

export async function portalSignOut(formData: FormData): Promise<void> {
  void formData;
  await endPortalSession();
  const org = await getRequestPortalOrg();
  redirect(org ? "/login" : "/");
}
