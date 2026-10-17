# SePay rollout and operations

SePay must stay disabled until the database backup, additive schema deployment, first platform administrator, central bank account, and secrets are all ready.

## Required environment

- `CHECKOUT_TOKEN_SECRET`: at least 32 random bytes used to hash customer checkout tokens.
- `SEPAY_WEBHOOK_SECRET`: shared secret for `X-SePay-Signature` verification.
- `SEPAY_API_TOKEN`: Bearer token for API v2 reconciliation.
- `SEPAY_ENV`: `sandbox` during verification, then `production`.
- `NEXT_PUBLIC_APP_URL`: public vFurst origin used by the worker when forwarding reconciled transfers through the webhook processor.

Configure SePay to send webhooks to `POST /api/webhooks/sepay`. The signed message is `{timestamp}.{raw_body}` using HMAC-SHA256. The platform rejects timestamps outside five minutes and deduplicates by SePay transaction ID.

## Activation order

1. Back up PostgreSQL and deploy the additive Prisma schema.
2. Add the initial administrator to the authentik group named by `VFURST_PLATFORM_ADMIN_GROUP` (default `vfurst-platform-admins`); the role applies at their next sign-in.
3. In Dashboard → Settings, enter the central bank code, account number, holder, SePay bank-account ID, memo prefix, and VND registration/hotel fees.
4. Configure the same payment-code prefix in SePay and confirm the central account is connected.
5. Send sandbox transfers covering exact, duplicate, underpaid, overpaid, unmatched, and late cases. Confirm only exact, timely transfers fulfill orders.
6. Confirm the 15-minute reconciliation worker advances its durable cursor and replays missed transfers through the same webhook processor.
7. Enable SePay. Provider switches affect new attempts only; existing attempts and callbacks continue to be processed.

## Settlement and refunds

Each paid SePay order credits the organizer ledger by `order total - platform fee`. Platform administrators export open ledger entries, transfer funds externally using the organizer's saved bank details, then record the exact selected payout and bank reference.

SePay refunds are full manual transfers. Transfer the funds externally first, then record the reference in platform settings. vFurst reverses fulfillment idempotently and records a negative organizer ledger entry.

Official references: [Embedded VietQR](https://developer.sepay.vn/en/vietqr.html), [webhook authentication](https://developer.sepay.vn/en/webhooks.html), and [API v2 transactions](https://developer.sepay.vn/en/sepay-api.html).
