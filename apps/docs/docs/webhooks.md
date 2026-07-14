---
id: webhooks
title: Webhooks
---

Webhook endpoints receive signed JSON envelopes. Failed deliveries retry through BullMQ with exponential backoff. Each endpoint receives its own job, and the payload `id` remains stable across retries so consumers can deduplicate safely.

Endpoints must use a public HTTPS DNS hostname. vFurst rejects credentials in URLs, private/local DNS answers, IP-literal targets, redirects, and deliveries that exceed the timeout.

## Headers

- `x-vfurst-event`: event type
- `x-vfurst-timestamp`: Unix timestamp
- `x-vfurst-signature`: HMAC-SHA256 of `timestamp.body` using the endpoint secret

Verify the timestamp and signature against the exact raw request body before parsing JSON. Compare signatures in constant time and deduplicate the stable payload `id`.

## Event catalog

- `event.published`
- `registration.created`
- `registration.checked_in`
- `order.paid`
- `order.refunded`
- `hotel_booking.created`
- `volunteer_application.submitted`
- `vendor_application.submitted`
- `webhook.test`

## Payload

```json
{
  "id": "uuid",
  "type": "registration.created",
  "orgId": "uuid",
  "eventId": "uuid",
  "createdAt": "2026-07-07T00:00:00.000Z",
  "data": {
    "registrationId": "uuid"
  }
}
```
