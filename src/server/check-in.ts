import "server-only";
import type { OrderStatus, Registration } from "@prisma/client";

const PAID_ORDER_STATUSES: OrderStatus[] = ["PAID", "PARTIALLY_REFUNDED", "FULFILLED"];

export function isOrderStatusPaid(status: OrderStatus) {
  return PAID_ORDER_STATUSES.includes(status);
}

export function isRegistrationCheckedIn(registration: Pick<Registration, "checkedInAt">) {
  return Boolean(registration.checkedInAt);
}
