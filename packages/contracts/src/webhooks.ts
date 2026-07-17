import { z } from "zod";

export const WEBHOOK_EVENT_TYPES = [
  "event.published",
  "registration.created",
  "registration.checked_in",
  "order.paid",
  "order.refunded",
  "hotel_booking.created",
  "volunteer_application.submitted",
  "vendor_application.submitted",
  "webhook.test"
] as const;

export const webhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES);

export const webhookEventEnvelopeSchema = z.object({
  id: z.uuid(),
  type: webhookEventTypeSchema,
  orgId: z.uuid(),
  eventId: z.uuid().optional(),
  createdAt: z.iso.datetime(),
  data: z.record(z.string(), z.unknown())
});

export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;
export type WebhookEventEnvelope = z.infer<typeof webhookEventEnvelopeSchema>;
