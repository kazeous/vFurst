import { describe, expect, it } from "vitest";
import {
  EMAIL_DEAD_LETTER_JOB_OPTIONS,
  QUEUE_JOB_NAMES,
  QUEUE_NAMES,
  STANDARD_QUEUE_JOB_OPTIONS,
  badgeQueueJobSchema,
  emailDeadLetterQueueJobSchema,
  emailQueueJobSchema,
  queueJobSchema,
  reconcileQueueJobSchema,
  webhookQueueJobSchema
} from "./queues.js";

const ids = {
  badge: "11111111-1111-4111-8111-111111111111",
  correlation: "22222222-2222-4222-8222-222222222222",
  delivery: "33333333-3333-4333-8333-333333333333",
  endpoint: "44444444-4444-4444-8444-444444444444",
  event: "55555555-5555-4555-8555-555555555555",
  org: "66666666-6666-4666-8666-666666666666",
  template: "77777777-7777-4777-8777-777777777777"
};

describe("queue contracts", () => {
  it("publishes the complete current queue and job-name vocabulary", () => {
    expect(QUEUE_NAMES).toEqual(["email", "email-dead-letter", "badge", "reconcile", "webhook"]);
    expect(QUEUE_JOB_NAMES).toMatchObject({
      email: "send-email",
      badge: "generate-badges",
      reconcileSePay: "reconcile-sepay",
      expireCheckouts: "expire-checkouts"
    });
  });

  it("keeps the standard retry policy aligned across producers and consumers", () => {
    expect(STANDARD_QUEUE_JOB_OPTIONS).toEqual({
      attempts: 5,
      backoff: { type: "exponential", delay: 5_000 },
      removeOnComplete: 500,
      removeOnFail: false
    });
    expect(EMAIL_DEAD_LETTER_JOB_OPTIONS).toEqual({
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false
    });
  });

  it("accepts pointer-only email and dead-letter jobs", () => {
    expect(
      emailQueueJobSchema.parse({
        queue: "email",
        name: "send-email",
        data: { deliveryId: ids.delivery }
      }).data
    ).toEqual({ deliveryId: ids.delivery });

    expect(
      emailDeadLetterQueueJobSchema.parse({
        queue: "email-dead-letter",
        name: "email-dead-letter",
        data: {
          deliveryId: ids.delivery,
          failedAt: "2026-07-17T10:00:00.000Z",
          errorCode: "SMTP_REJECTED"
        }
      }).data.errorCode
    ).toBe("SMTP_REJECTED");
  });

  it("accepts both event-wide and selected badge render jobs", () => {
    expect(
      badgeQueueJobSchema.parse({
        queue: "badge",
        name: "generate-badges",
        data: { orgId: ids.org, eventId: ids.event, templateId: ids.template }
      }).data.badgeIds
    ).toBeUndefined();

    expect(
      badgeQueueJobSchema.parse({
        queue: "badge",
        name: "generate-badges",
        data: {
          orgId: ids.org,
          eventId: ids.event,
          templateId: ids.template,
          badgeIds: [ids.badge]
        }
      }).data.badgeIds
    ).toEqual([ids.badge]);
  });

  it("distinguishes tenant-scoped fee reconciliation from empty scheduled jobs", () => {
    expect(
      reconcileQueueJobSchema.parse({
        queue: "reconcile",
        name: "reconcile-fees",
        data: { orgId: ids.org }
      }).data
    ).toEqual({ orgId: ids.org });

    expect(
      reconcileQueueJobSchema.parse({
        queue: "reconcile",
        name: "recover-email-deliveries",
        data: {}
      }).name
    ).toBe("recover-email-deliveries");

    expect(() =>
      reconcileQueueJobSchema.parse({
        queue: "reconcile",
        name: "expire-checkouts",
        data: { orgId: ids.org }
      })
    ).toThrow();
  });

  it("requires webhook job names to agree with their signed payload type", () => {
    const job = {
      queue: "webhook" as const,
      name: "registration.created" as const,
      data: {
        deliveryId: ids.delivery,
        createdAt: "2026-07-17T10:00:00.000Z",
        orgId: ids.org,
        endpointId: ids.endpoint,
        type: "registration.created" as const,
        eventId: ids.event,
        data: { registrationId: ids.correlation }
      }
    };

    expect(webhookQueueJobSchema.parse(job).data.endpointId).toBe(ids.endpoint);
    expect(() => webhookQueueJobSchema.parse({ ...job, name: "order.paid" })).toThrow(
      "Webhook queue job name must match"
    );
  });

  it("rejects malformed jobs through the aggregate queue schema", () => {
    expect(() =>
      queueJobSchema.parse({
        queue: "email",
        name: "send-email",
        data: { deliveryId: "not-a-uuid" }
      })
    ).toThrow();
  });
});
