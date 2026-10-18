"use client";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type RegistrationConfirmation = {
  attendee: string;
  approvalStatus: "APPROVED" | "PENDING" | "REJECTED";
  confirmed: true;
  event: string;
  tier: string;
};

type ConfirmationLookup = {
  registrationId: string;
  confirmation: RegistrationConfirmation | null;
};

const approvalOutcomes = {
  APPROVED: {
    title: "Registration confirmed",
    status: "Approved",
    summary: "Your ticket is saved to your account on this portal.",
    variant: "success"
  },
  PENDING: {
    title: "Registration awaiting approval",
    status: "Awaiting approval",
    summary: "Your registration is saved. The organizer must approve it before check-in.",
    variant: "warning"
  },
  REJECTED: {
    title: "Registration not approved",
    status: "Not approved",
    summary: "The organizer did not approve this registration. Contact the organizer with any questions.",
    variant: "warning"
  }
} as const;

// Renders the registration page body: the finished state for a confirmed
// `?success=` registration, otherwise the registration flow passed as children.
export function RegistrationOutcome({ orgSlug, children }: { orgSlug: string; children: ReactNode }) {
  const searchParams = useSearchParams();
  const registrationId = searchParams.get("success");
  const cancelled = searchParams.has("cancelled");
  const [lookup, setLookup] = useState<ConfirmationLookup | null>(null);

  useEffect(() => {
    if (!registrationId) {
      return;
    }

    const controller = new AbortController();
    const query = new URLSearchParams({ registrationId });

    fetch(`/api/public/registration-confirmation?${query}`, {
      cache: "no-store",
      signal: controller.signal
    })
      .then(async (response) => {
        setLookup({
          registrationId,
          confirmation: response.ok ? ((await response.json()) as RegistrationConfirmation) : null
        });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLookup({ registrationId, confirmation: null });
        }
      });

    return () => controller.abort();
  }, [orgSlug, registrationId]);

  // A lookup for an earlier success ID does not describe this one.
  const settled = registrationId !== null && lookup?.registrationId === registrationId;

  if (registrationId && !settled) {
    return (
      <section className="vf-section" aria-live="polite">
        <h2>Checking your registration</h2>
        <p className="vf-muted">One moment while vFurst confirms your registration.</p>
      </section>
    );
  }

  if (settled && lookup.confirmation) {
    return <RegistrationFinished confirmation={lookup.confirmation} />;
  }

  return (
    <>
      {cancelled ? (
        <Alert variant="warning">
          <h2>Checkout cancelled</h2>
          <p>No payment was captured. Your ticket selection is still available to start again.</p>
        </Alert>
      ) : null}
      {children}
    </>
  );
}

function RegistrationFinished({ confirmation }: { confirmation: RegistrationConfirmation }) {
  const outcome = approvalOutcomes[confirmation.approvalStatus];

  return (
    <section className="vf-section vf-stack" aria-labelledby="registration-outcome-title">
      <Alert variant={outcome.variant}>
        <h2 id="registration-outcome-title">{outcome.title}</h2>
        <p>{outcome.summary}</p>
      </Alert>
      <dl className="vf-review-list">
        <div><dt>Attendee</dt><dd>{confirmation.attendee}</dd></div>
        <div><dt>Event</dt><dd>{confirmation.event}</dd></div>
        <div><dt>Ticket</dt><dd>{confirmation.tier}</dd></div>
        <div><dt>Approval</dt><dd>{outcome.status}</dd></div>
      </dl>
      <div className="vf-actions">
        <Button label="View my registrations" href="/account/registrations" variant="primary" />
        <Button label="Register another ticket" href="/register" />
      </div>
    </section>
  );
}
