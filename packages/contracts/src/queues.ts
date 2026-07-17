import { z } from "zod";
import { webhookEventTypeSchema } from "./webhooks.js";

export const QUEUE_NAMES = ["email", "email-dead-letter", "badge", "reconcile", "webhook"] as const;

export const QUEUE_JOB_NAMES = {
  email: "send-email",
  emailDeadLetter: "email-dead-letter",
  badge: "generate-badges",
  reconcileFees: "reconcile-fees",
  reconcileSePay: "reconcile-sepay",
  expireCheckouts: "expire-checkouts",
  recoverEmailDeliveries: "recover-email-deliveries"
} as const;

export const STANDARD_QUEUE_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 5_000
  },
  removeOnComplete: 500,
  removeOnFail: false
} as const;

export const EMAIL_DEAD_LETTER_JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: false,
  removeOnFail: false
} as const;

export const sendEmailJobDataSchema = z.object({
  deliveryId: z.uuid()
});

export const emailDeadLetterJobDataSchema = z.object({
  deliveryId: z.uuid(),
  failedAt: z.iso.datetime(),
  errorCode: z.string().trim().min(1).max(100)
});

export const generateBadgesJobDataSchema = z.object({
  orgId: z.uuid(),
  eventId: z.uuid(),
  templateId: z.uuid(),
  badgeIds: z.array(z.uuid()).min(1).optional()
});

export const reconcileFeesJobDataSchema = z.object({
  orgId: z.uuid().optional()
});

export const emptyReconciliationJobDataSchema = z.object({}).strict();

export const outboundWebhookJobDataSchema = z.object({
  deliveryId: z.uuid(),
  createdAt: z.iso.datetime(),
  orgId: z.uuid(),
  endpointId: z.uuid(),
  type: webhookEventTypeSchema,
  eventId: z.uuid().optional(),
  data: z.record(z.string(), z.unknown())
});

export const emailQueueJobSchema = z.object({
  queue: z.literal("email"),
  name: z.literal(QUEUE_JOB_NAMES.email),
  data: sendEmailJobDataSchema
});

export const emailDeadLetterQueueJobSchema = z.object({
  queue: z.literal("email-dead-letter"),
  name: z.literal(QUEUE_JOB_NAMES.emailDeadLetter),
  data: emailDeadLetterJobDataSchema
});

export const badgeQueueJobSchema = z.object({
  queue: z.literal("badge"),
  name: z.literal(QUEUE_JOB_NAMES.badge),
  data: generateBadgesJobDataSchema
});

export const reconcileQueueJobSchema = z.discriminatedUnion("name", [
  z.object({
    queue: z.literal("reconcile"),
    name: z.literal(QUEUE_JOB_NAMES.reconcileFees),
    data: reconcileFeesJobDataSchema
  }),
  z.object({
    queue: z.literal("reconcile"),
    name: z.literal(QUEUE_JOB_NAMES.reconcileSePay),
    data: emptyReconciliationJobDataSchema
  }),
  z.object({
    queue: z.literal("reconcile"),
    name: z.literal(QUEUE_JOB_NAMES.expireCheckouts),
    data: emptyReconciliationJobDataSchema
  }),
  z.object({
    queue: z.literal("reconcile"),
    name: z.literal(QUEUE_JOB_NAMES.recoverEmailDeliveries),
    data: emptyReconciliationJobDataSchema
  })
]);

export const webhookQueueJobSchema = z
  .object({
    queue: z.literal("webhook"),
    name: webhookEventTypeSchema,
    data: outboundWebhookJobDataSchema
  })
  .refine((job) => job.name === job.data.type, {
    message: "Webhook queue job name must match the payload event type.",
    path: ["name"]
  });

export const queueJobSchema = z.union([
  emailQueueJobSchema,
  emailDeadLetterQueueJobSchema,
  badgeQueueJobSchema,
  reconcileQueueJobSchema,
  webhookQueueJobSchema
]);

export type QueueName = (typeof QUEUE_NAMES)[number];
export type SendEmailJobData = z.infer<typeof sendEmailJobDataSchema>;
export type EmailDeadLetterJobData = z.infer<typeof emailDeadLetterJobDataSchema>;
export type GenerateBadgesJobData = z.infer<typeof generateBadgesJobDataSchema>;
export type ReconcileFeesJobData = z.infer<typeof reconcileFeesJobDataSchema>;
export type OutboundWebhookJobData = z.infer<typeof outboundWebhookJobDataSchema>;
export type QueueJob = z.infer<typeof queueJobSchema>;
