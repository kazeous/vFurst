export const EMAIL_TEMPLATE_KEYS = [
  "ORGANIZATION_INVITE",
  "EVENT_INVITE",
  "REGISTRATION_CONFIRMATION",
  "VENDOR_APPLICATION_RECEIVED",
  "VOLUNTEER_APPLICATION_RECEIVED",
  "ORDER_RECEIPT"
] as const;

export const EMAIL_TEMPLATE_SCOPES = ["SYSTEM", "ORGANIZATION", "EVENT"] as const;

export const EMAIL_LOG_STATUSES = ["SKIPPED", "SENT", "FAILED"] as const;

export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];
export type EmailTemplateScope = (typeof EMAIL_TEMPLATE_SCOPES)[number];
export type EmailLogStatus = (typeof EMAIL_LOG_STATUSES)[number];

