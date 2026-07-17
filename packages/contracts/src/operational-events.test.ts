import { describe, expect, it } from "vitest";
import {
  tenantEmailDeliveryChangedEventSchema,
  tenantMembershipChangedEventSchema,
  tenantOperationalEventSchema,
  tenantOrderChangedEventSchema,
  tenantRegistrationChangedEventSchema,
  tenantRegistrationTransferChangedEventSchema
} from "./operational-events.js";

const ids = {
  actor: "11111111-1111-4111-8111-111111111111",
  correlation: "22222222-2222-4222-8222-222222222222",
  delivery: "33333333-3333-4333-8333-333333333333",
  event: "44444444-4444-4444-8444-444444444444",
  message: "55555555-5555-4555-8555-555555555555",
  org: "66666666-6666-4666-8666-666666666666",
  order: "77777777-7777-4777-8777-777777777777",
  registration: "88888888-8888-4888-8888-888888888888",
  registrationPrevious: "99999999-9999-4999-8999-999999999999",
  request: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userPrevious: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
};

const metadata = {
  id: ids.message,
  organizationId: ids.org,
  occurredAt: "2026-07-17T10:00:00.000Z",
  actorUserId: ids.actor,
  correlationId: ids.correlation,
  source: "tenant-web" as const
};

describe("tenant operational events", () => {
  it("models membership invalidation without coupling consumers to route paths", () => {
    const event = tenantMembershipChangedEventSchema.parse({
      ...metadata,
      source: "platform-manager",
      type: "tenant.membership-changed",
      data: { userId: ids.user, change: "ADDED", role: "OWNER" }
    });

    expect(event.data).toEqual({ userId: ids.user, change: "ADDED", role: "OWNER" });
    expect(event).not.toHaveProperty("revalidatePath");
  });

  it("carries both account owners affected by a registration transfer", () => {
    const event = tenantRegistrationChangedEventSchema.parse({
      ...metadata,
      type: "tenant.registration-changed",
      data: {
        eventId: ids.event,
        registrationId: ids.registration,
        previousRegistrationId: ids.registrationPrevious,
        affectedUserIds: [ids.userPrevious, ids.user],
        change: "TRANSFERRED"
      }
    });

    expect(event.data.affectedUserIds).toHaveLength(2);
  });

  it("models declined transfer requests even when no registration row changes", () => {
    const event = tenantRegistrationTransferChangedEventSchema.parse({
      ...metadata,
      source: "platform-manager",
      type: "tenant.registration-transfer-changed",
      data: {
        eventId: ids.event,
        requestId: ids.request,
        sourceRegistrationId: ids.registrationPrevious,
        newRegistrationId: null,
        recipientUserId: ids.user,
        affectedUserIds: [ids.userPrevious, ids.user],
        status: "DECLINED"
      }
    });

    expect(event.data.newRegistrationId).toBeNull();
    expect(event.data.status).toBe("DECLINED");
  });

  it("captures platform-initiated order changes for tenant and account refresh", () => {
    const event = tenantOrderChangedEventSchema.parse({
      ...metadata,
      source: "platform-manager",
      type: "tenant.order-changed",
      data: {
        eventId: ids.event,
        orderId: ids.order,
        userId: ids.user,
        previousStatus: "PAID",
        status: "REFUNDED"
      }
    });

    expect(event.data.status).toBe("REFUNDED");
  });

  it("identifies email replay lineage across the manager and tenant console", () => {
    const event = tenantEmailDeliveryChangedEventSchema.parse({
      ...metadata,
      type: "tenant.email-delivery-changed",
      data: {
        deliveryId: ids.delivery,
        eventId: ids.event,
        replayOfId: ids.message,
        status: "QUEUED"
      }
    });

    expect(event.data.replayOfId).toBe(ids.message);
  });

  it("rejects invalid source identities and empty affected-user lists", () => {
    expect(() =>
      tenantOperationalEventSchema.parse({
        ...metadata,
        source: "browser",
        type: "tenant.registration-changed",
        data: {
          eventId: ids.event,
          registrationId: ids.registration,
          previousRegistrationId: null,
          affectedUserIds: [],
          change: "STATUS_CHANGED"
        }
      })
    ).toThrow();
  });
});
