"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function PaymentStatusPoller({ orderId, token }: { orderId: string; token: string }) {
  const router = useRouter();

  useEffect(() => {
    let stopped = false;

    const check = async () => {
      const response = await fetch(`/api/payments/orders/${orderId}/status?token=${encodeURIComponent(token)}`, {
        cache: "no-store"
      });

      if (!response.ok || stopped) {
        return;
      }

      const result = (await response.json()) as { status: string; successPath?: string };

      if (result.status === "PAID" && result.successPath) {
        stopped = true;
        window.location.assign(result.successPath);
      } else if (["EXPIRED", "FAILED", "CANCELLED", "REVIEW"].includes(result.status)) {
        stopped = true;
        router.refresh();
      }
    };

    void check();
    const interval = window.setInterval(() => void check(), 3_000);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [orderId, router, token]);

  return <p className="vf-muted">Waiting for bank confirmation. This page checks automatically every three seconds.</p>;
}
