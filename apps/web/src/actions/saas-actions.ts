"use server";

import { randomBytes } from "node:crypto";
import { getOrganizationFeeReport } from "@/lib/billing/reports";
import { hashApiKey } from "@/lib/api/auth";
import {
  requireApiKeyAccess,
  requireOrgAccess,
  requireWebhookEndpointAccess
} from "@/lib/dashboard-access";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhook-events";
import { normalizeWebhookTarget } from "@/lib/webhook-target";
import { queueWebhookEndpointTest } from "@/lib/webhooks";
import { prisma } from "@vfurst/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

const API_SCOPES = [
  "read:events",
  "read:registrations",
  "read:attendees",
  "read:vendors",
  "read:store",
  "read:badges"
] as const;

const apiKeySchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(API_SCOPES)).min(1)
});

const webhookPayloadSchema = z.object({
  url: z.string().trim().url(),
  secret: z.string().trim().min(24).max(256).optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
  active: z.boolean()
});

export type CreateApiKeyState = {
  error?: string;
  token?: string;
};

export type CreateWebhookEndpointState = {
  error?: string;
  secret?: string;
};

function selectedValues<T extends readonly string[]>(formData: FormData, key: string, allowed: T) {
  const allowedSet = new Set<string>(allowed);
  return formData
    .getAll(key)
    .map(String)
    .filter((value): value is T[number] => allowedSet.has(value));
}

function newApiKey() {
  return `vf_test_${randomBytes(24).toString("base64url")}`;
}

function newWebhookSecret() {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export async function createApiKey(
  _previousState: CreateApiKeyState,
  formData: FormData
): Promise<CreateApiKeyState> {
  const parsed = apiKeySchema.safeParse({
    orgId: formData.get("orgId"),
    name: formData.get("name"),
    scopes: selectedValues(formData, "scopes", API_SCOPES)
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid API key." };
  }

  await requireOrgAccess(parsed.data.orgId);

  const token = newApiKey();
  await prisma.apiKey.create({
    data: {
      orgId: parsed.data.orgId,
      name: parsed.data.name,
      keyHash: hashApiKey(token),
      scopes: parsed.data.scopes
    }
  });

  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}/api-keys`);
  return { token };
}

export async function revokeApiKey(formData: FormData) {
  const keyId = z.string().uuid().parse(formData.get("keyId"));
  const { apiKey } = await requireApiKeyAccess(keyId);

  const deleted = await prisma.apiKey.deleteMany({
    where: {
      id: apiKey.id,
      orgId: apiKey.orgId
    }
  });

  if (deleted.count !== 1) {
    throw new Error("API key not found.");
  }

  revalidatePath(`/dashboard/organizations/${apiKey.orgId}/api-keys`);
}

export async function updateApiKeyScopes(formData: FormData) {
  const parsed = z
    .object({
      keyId: z.string().uuid(),
      scopes: z.array(z.enum(API_SCOPES)).min(1)
    })
    .safeParse({
      keyId: formData.get("keyId"),
      scopes: selectedValues(formData, "scopes", API_SCOPES)
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Select at least one API scope.");
  }

  const { apiKey } = await requireApiKeyAccess(parsed.data.keyId);
  const updated = await prisma.apiKey.updateMany({
    where: {
      id: apiKey.id,
      orgId: apiKey.orgId
    },
    data: {
      scopes: parsed.data.scopes
    }
  });

  if (updated.count !== 1) {
    throw new Error("API key not found.");
  }

  revalidatePath(`/dashboard/organizations/${apiKey.orgId}/api-keys`);
}

function webhookPayloadFromForm(formData: FormData) {
  return webhookPayloadSchema.safeParse({
    url: formData.get("url"),
    secret: formData.get("secret") || undefined,
    events: selectedValues(formData, "events", WEBHOOK_EVENT_TYPES),
    active: formData.get("active") === "on"
  });
}

export async function createWebhookEndpoint(
  _previousState: CreateWebhookEndpointState,
  formData: FormData
): Promise<CreateWebhookEndpointState> {
  const orgId = z.string().uuid().safeParse(formData.get("orgId"));
  const parsed = webhookPayloadFromForm(formData);

  if (!orgId.success) {
    return { error: orgId.error.issues[0]?.message ?? "Invalid organization." };
  }

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid webhook endpoint." };
  }

  let url: string;

  try {
    url = normalizeWebhookTarget(parsed.data.url);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid webhook endpoint." };
  }

  await requireOrgAccess(orgId.data);
  const secret = parsed.data.secret ?? newWebhookSecret();

  await prisma.webhookEndpoint.create({
    data: {
      orgId: orgId.data,
      url,
      secret,
      events: parsed.data.events,
      active: parsed.data.active
    }
  });

  revalidatePath(`/dashboard/organizations/${orgId.data}/webhooks`);
  return { secret };
}

export async function updateWebhookEndpoint(formData: FormData) {
  const endpointId = z.string().uuid().parse(formData.get("endpointId"));
  const { webhookEndpoint } = await requireWebhookEndpointAccess(endpointId);
  const parsed = webhookPayloadFromForm(formData);

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid webhook endpoint.");
  }

  const url = normalizeWebhookTarget(parsed.data.url);
  const updated = await prisma.webhookEndpoint.updateMany({
    where: {
      id: webhookEndpoint.id,
      orgId: webhookEndpoint.orgId
    },
    data: {
      url,
      events: parsed.data.events,
      active: parsed.data.active,
      ...(parsed.data.secret ? { secret: parsed.data.secret } : {})
    }
  });

  if (updated.count !== 1) {
    throw new Error("Webhook endpoint not found.");
  }

  revalidatePath(`/dashboard/organizations/${webhookEndpoint.orgId}/webhooks`);
}

export async function deleteWebhookEndpoint(formData: FormData) {
  const endpointId = z.string().uuid().parse(formData.get("endpointId"));
  const { webhookEndpoint } = await requireWebhookEndpointAccess(endpointId);

  const deleted = await prisma.webhookEndpoint.deleteMany({
    where: {
      id: webhookEndpoint.id,
      orgId: webhookEndpoint.orgId
    }
  });

  if (deleted.count !== 1) {
    throw new Error("Webhook endpoint not found.");
  }

  revalidatePath(`/dashboard/organizations/${webhookEndpoint.orgId}/webhooks`);
}

export async function testWebhookEndpoint(formData: FormData) {
  const endpointId = z.string().uuid().parse(formData.get("endpointId"));
  const { webhookEndpoint } = await requireWebhookEndpointAccess(endpointId);

  await queueWebhookEndpointTest(webhookEndpoint);

  revalidatePath(`/dashboard/organizations/${webhookEndpoint.orgId}/webhooks`);
}

export async function runFeeReconciliation(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));

  await requireOrgAccess(orgId);
  const report = await getOrganizationFeeReport(orgId);

  try {
    await import("@/lib/reconcile-queue").then(({ reconcileQueue }) =>
      reconcileQueue.add("reconcile-fees", {
        orgId
      })
    );
  } catch {
    // The page computes the report synchronously; queueing is best-effort when Redis is unavailable.
  }

  revalidatePath(`/dashboard/organizations/${orgId}/billing`);
  redirect(`/dashboard/organizations/${orgId}/billing?reconciled=${report.generatedAt}`);
}
