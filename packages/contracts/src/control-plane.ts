import { z } from "zod";

export const TENANT_LIFECYCLE_STATUSES = ["PROVISIONING", "ACTIVE", "SUSPENDED", "RETIRED"] as const;
export const CONTROL_PLANE_EVENT_TYPES = [
  "tenant.lifecycle-changed",
  "tenant.domain-activated",
  "tenant.domain-disabled",
  "platform.payment-policy-changed"
] as const;

export const tenantLifecycleStatusSchema = z.enum(TENANT_LIFECYCLE_STATUSES);

const eventMetadataSchema = z.object({
  id: z.uuid(),
  aggregateType: z.string().trim().min(1).max(100),
  aggregateId: z.string().trim().min(1).max(255),
  occurredAt: z.iso.datetime(),
  actorUserId: z.uuid().nullable(),
  aggregateVersion: z.number().int().positive(),
  correlationId: z.uuid()
});

const tenantEventMetadataSchema = eventMetadataSchema.extend({
  organizationId: z.uuid()
});

export const tenantLifecycleChangedEventSchema = tenantEventMetadataSchema.extend({
  type: z.literal("tenant.lifecycle-changed"),
  data: z.object({
    previousStatus: tenantLifecycleStatusSchema,
    status: tenantLifecycleStatusSchema
  })
});

export const tenantDomainActivatedEventSchema = tenantEventMetadataSchema.extend({
  type: z.literal("tenant.domain-activated"),
  data: z.object({
    hostname: z.string().trim().toLowerCase().min(3).max(253),
    previousHostname: z.string().trim().toLowerCase().min(3).max(253).nullable()
  })
});

export const tenantDomainDisabledEventSchema = tenantEventMetadataSchema.extend({
  type: z.literal("tenant.domain-disabled"),
  data: z.object({
    hostname: z.string().trim().toLowerCase().min(3).max(253)
  })
});

export const platformPaymentPolicyChangedEventSchema = eventMetadataSchema.extend({
  type: z.literal("platform.payment-policy-changed"),
  data: z.object({
    providers: z.array(
      z.object({
        provider: z.enum(["STRIPE", "SEPAY"]),
        enabled: z.boolean()
      })
    ),
    policyVersion: z.number().int().positive()
  })
});

export const controlPlaneEventSchema = z.discriminatedUnion("type", [
  tenantLifecycleChangedEventSchema,
  tenantDomainActivatedEventSchema,
  tenantDomainDisabledEventSchema,
  platformPaymentPolicyChangedEventSchema
]);

export const provisionTenantCommandSchema = z.object({
  idempotencyKey: z.uuid(),
  correlationId: z.uuid(),
  name: z.string().trim().min(2).max(160),
  subdomain: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
  initialOwnerEmail: z.email().transform((value) => value.trim().toLowerCase())
});

export const changeTenantLifecycleCommandSchema = z.object({
  idempotencyKey: z.uuid(),
  correlationId: z.uuid(),
  organizationId: z.uuid(),
  targetStatus: tenantLifecycleStatusSchema
});

export const activateTenantDomainCommandSchema = z.object({
  idempotencyKey: z.uuid(),
  correlationId: z.uuid(),
  organizationId: z.uuid(),
  hostname: z.string().trim().toLowerCase().min(3).max(253)
});

export type ControlPlaneEvent = z.infer<typeof controlPlaneEventSchema>;
export type TenantLifecycleStatus = z.infer<typeof tenantLifecycleStatusSchema>;
export type ProvisionTenantCommand = z.infer<typeof provisionTenantCommandSchema>;
export type ChangeTenantLifecycleCommand = z.infer<typeof changeTenantLifecycleCommandSchema>;
export type ActivateTenantDomainCommand = z.infer<typeof activateTenantDomainCommandSchema>;
