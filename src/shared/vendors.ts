export const VENDOR_APPLICATION_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED_UNPAID",
  "APPROVED_PAID",
  "REJECTED",
  "WAITLISTED"
] as const;

export type VendorApplicationStatusValue = (typeof VENDOR_APPLICATION_STATUSES)[number];
