import { Badge } from "@/components/ui/badge";

function variant(status: string) {
  if (["PAID", "CONFIRMED", "CHECKED_IN", "APPROVED", "COMPLETED"].includes(status)) return "success" as const;
  if (["FAILED", "CANCELLED", "REJECTED"].includes(status)) return "error" as const;
  if (["PARTIALLY_REFUNDED", "REFUNDED", "WAITLISTED"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export function AccountStatus({ status }: { status: string }) {
  return <Badge label={status.replaceAll("_", " ")} variant={variant(status)} />;
}
