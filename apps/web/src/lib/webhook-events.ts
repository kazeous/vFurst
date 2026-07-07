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

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];
