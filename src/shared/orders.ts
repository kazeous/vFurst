export const ORDER_STATUSES = ["UNPAID", "PAID", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED", "FULFILLED"] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = ["PENDING", "SUCCEEDED", "FAILED", "CANCELLED", "REFUNDED", "PARTIALLY_REFUNDED"] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];
