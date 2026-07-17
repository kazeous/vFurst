import { z } from "zod";

export const TENANT_OPERATIONAL_EVENT_TYPES = [
  "tenant.membership-changed",
  "tenant.registration-changed",
  "tenant.registration-transfer-changed",
  "tenant.order-changed",
  "tenant.email-delivery-changed"
] as const;

export const TENANT_OPERATIONAL_EVENT_SOURCES = ["platform-manager", "tenant-web", "worker"] as const;

const tenantOperationalEventMetadataSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  occurredAt: z.iso.datetime(),
  actorUserId: z.uuid().nullable(),
  correlationId: z.uuid(),
  source: z.enum(TENANT_OPERATIONAL_EVENT_SOURCES)
});

export const tenantMembershipChangedEventSchema = tenantOperationalEventMetadataSchema.extend({
  type: z.literal("tenant.membership-changed"),
  data: z.object({
    userId: z.uuid(),
    change: z.enum(["ADDED", "REMOVED", "ROLE_CHANGED"]),
    role: z.enum(["OWNER", "ADMIN", "MEMBER"]).nullable()
  })
});

export const tenantRegistrationChangedEventSchema = tenantOperationalEventMetadataSchema.extend({
  type: z.literal("tenant.registration-changed"),
  data: z.object({
    eventId: z.uuid(),
    registrationId: z.uuid(),
    previousRegistrationId: z.uuid().nullable(),
    affectedUserIds: z.array(z.uuid()).min(1),
    change: z.enum(["CREATED", "STATUS_CHANGED", "TRANSFERRED", "CHECKED_IN", "REFUNDED"])
  })
});

export const tenantRegistrationTransferChangedEventSchema = tenantOperationalEventMetadataSchema.extend({
  type: z.literal("tenant.registration-transfer-changed"),
  data: z.object({
    eventId: z.uuid(),
    requestId: z.uuid(),
    sourceRegistrationId: z.uuid(),
    newRegistrationId: z.uuid().nullable(),
    recipientUserId: z.uuid().nullable(),
    affectedUserIds: z.array(z.uuid()).min(1),
    status: z.enum(["PENDING", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"])
  })
});

export const tenantOrderChangedEventSchema = tenantOperationalEventMetadataSchema.extend({
  type: z.literal("tenant.order-changed"),
  data: z.object({
    eventId: z.uuid(),
    orderId: z.uuid(),
    userId: z.uuid(),
    previousStatus: z.enum(["PENDING", "PAID", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED", "FAILED"]),
    status: z.enum(["PENDING", "PAID", "PARTIALLY_REFUNDED", "REFUNDED", "CANCELLED", "FAILED"])
  })
});

export const tenantEmailDeliveryChangedEventSchema = tenantOperationalEventMetadataSchema.extend({
  type: z.literal("tenant.email-delivery-changed"),
  data: z.object({
    deliveryId: z.uuid(),
    eventId: z.uuid().nullable(),
    replayOfId: z.uuid().nullable(),
    status: z.enum(["QUEUED", "PROCESSING", "RETRYING", "DELIVERED", "DEAD_LETTERED"])
  })
});

export const tenantOperationalEventSchema = z.discriminatedUnion("type", [
  tenantMembershipChangedEventSchema,
  tenantRegistrationChangedEventSchema,
  tenantRegistrationTransferChangedEventSchema,
  tenantOrderChangedEventSchema,
  tenantEmailDeliveryChangedEventSchema
]);

export type TenantOperationalEvent = z.infer<typeof tenantOperationalEventSchema>;
export type TenantMembershipChangedEvent = z.infer<typeof tenantMembershipChangedEventSchema>;
export type TenantRegistrationChangedEvent = z.infer<typeof tenantRegistrationChangedEventSchema>;
export type TenantRegistrationTransferChangedEvent = z.infer<typeof tenantRegistrationTransferChangedEventSchema>;
export type TenantOrderChangedEvent = z.infer<typeof tenantOrderChangedEventSchema>;
export type TenantEmailDeliveryChangedEvent = z.infer<typeof tenantEmailDeliveryChangedEventSchema>;
