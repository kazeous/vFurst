"use server";

import { randomBytes } from "node:crypto";
import { getOrganizationFeeReport } from "@/lib/billing/reports";
import { hashApiKey } from "@/lib/api/auth";
import { requireOrgAccess } from "@/lib/dashboard-access";
import { WEBHOOK_EVENT_TYPES, webhookQueue } from "@/lib/webhook-queue";
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

const webhookSchema = z.object({
  orgId: z.string().uuid(),
  endpointId: z.string().uuid().optional(),
  url: z.string().trim().url(),
  secret: z.string().trim().min(12).optional(),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES)).min(1),
  active: z.boolean()
});

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

export async function createApiKey(formData: FormData) {
  const parsed = apiKeySchema.safeParse({
    orgId: formData.get("orgId"),
    name: formData.get("name"),
    scopes: selectedValues(formData, "scopes", API_SCOPES)
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid API key.");
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
  redirect(`/dashboard/organizations/${parsed.data.orgId}/api-keys?created=${encodeURIComponent(token)}`);
}

export async function revokeApiKey(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const keyId = z.string().uuid().parse(formData.get("keyId"));

  await requireOrgAccess(orgId);
  await prisma.apiKey.deleteMany({
    where: {
      id: keyId,
      orgId
    }
  });

  revalidatePath(`/dashboard/organizations/${orgId}/api-keys`);
}

export async function updateApiKeyScopes(formData: FormData) {
  const parsed = z
    .object({
      orgId: z.string().uuid(),
      keyId: z.string().uuid(),
      scopes: z.array(z.enum(API_SCOPES)).min(1)
    })
    .safeParse({
      orgId: formData.get("orgId"),
      keyId: formData.get("keyId"),
      scopes: selectedValues(formData, "scopes", API_SCOPES)
    });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Select at least one API scope.");
  }

  await requireOrgAccess(parsed.data.orgId);
  await prisma.apiKey.updateMany({
    where: {
      id: parsed.data.keyId,
      orgId: parsed.data.orgId
    },
    data: {
      scopes: parsed.data.scopes
    }
  });

  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}/api-keys`);
}

export async function saveWebhookEndpoint(formData: FormData) {
  const endpointId = String(formData.get("endpointId") ?? "") || undefined;
  const parsed = webhookSchema.safeParse({
    orgId: formData.get("orgId"),
    endpointId,
    url: formData.get("url"),
    secret: formData.get("secret") || undefined,
    events: selectedValues(formData, "events", WEBHOOK_EVENT_TYPES),
    active: formData.get("active") === "on"
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid webhook endpoint.");
  }

  await requireOrgAccess(parsed.data.orgId);

  if (parsed.data.endpointId) {
    const data = {
      url: parsed.data.url,
      events: parsed.data.events,
      active: parsed.data.active,
      ...(parsed.data.secret ? { secret: parsed.data.secret } : {})
    };

    await prisma.webhookEndpoint.updateMany({
      where: {
        id: parsed.data.endpointId,
        orgId: parsed.data.orgId
      },
      data
    });
  } else {
    await prisma.webhookEndpoint.create({
      data: {
        orgId: parsed.data.orgId,
        url: parsed.data.url,
        secret: parsed.data.secret ?? newWebhookSecret(),
        events: parsed.data.events,
        active: parsed.data.active
      }
    });
  }

  revalidatePath(`/dashboard/organizations/${parsed.data.orgId}/webhooks`);
}

export async function deleteWebhookEndpoint(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const endpointId = z.string().uuid().parse(formData.get("endpointId"));

  await requireOrgAccess(orgId);
  await prisma.webhookEndpoint.deleteMany({
    where: {
      id: endpointId,
      orgId
    }
  });

  revalidatePath(`/dashboard/organizations/${orgId}/webhooks`);
}

export async function testWebhookEndpoint(formData: FormData) {
  const orgId = z.string().uuid().parse(formData.get("orgId"));
  const endpointId = z.string().uuid().parse(formData.get("endpointId"));

  await requireOrgAccess(orgId);
  await webhookQueue.add("webhook.test", {
    orgId,
    endpointId,
    type: "webhook.test",
    data: {
      message: "vFurst webhook test",
      sentAt: new Date().toISOString()
    }
  });

  revalidatePath(`/dashboard/organizations/${orgId}/webhooks`);
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
