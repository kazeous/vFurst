"use client";

import { Alert } from "@/components/ui/alert";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type RegistrationConfirmation = {
  attendee: string;
  confirmed: true;
  event: string;
  tier: string;
};

export function RegistrationStatusAlert({ orgSlug }: { orgSlug: string }) {
  const searchParams = useSearchParams();
  const registrationId = searchParams.get("success");
  const cancelled = searchParams.has("cancelled");
  const [confirmation, setConfirmation] = useState<RegistrationConfirmation | null>(null);

  useEffect(() => {
    if (!registrationId) {
      setConfirmation(null);
      return;
    }

    setConfirmation(null);
    const controller = new AbortController();
    const query = new URLSearchParams({ orgSlug, registrationId });

    fetch(`/api/public/registration-confirmation?${query}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        setConfirmation(response.ok ? ((await response.json()) as RegistrationConfirmation) : null);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setConfirmation(null);
        }
      });

    return () => controller.abort();
  }, [orgSlug, registrationId]);

  if (confirmation) {
    return (
      <Alert variant="success">
        <h2>Registration confirmed</h2>
        <p>{confirmation.attendee} is registered for {confirmation.event} as {confirmation.tier}.</p>
      </Alert>
    );
  }

  if (cancelled) {
    return (
      <Alert variant="warning">
        <h2>Checkout cancelled</h2>
        <p>No payment was captured. Your ticket selection is still available to start again.</p>
      </Alert>
    );
  }

  return null;
}
