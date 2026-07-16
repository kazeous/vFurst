"use client";

import { Button } from "@/components/ui/button";
import { useSession } from "next-auth/react";
import type { ReactNode } from "react";

export function PublicAccountGate({
  children,
  loginHref,
  registerHref
}: {
  children: ReactNode;
  loginHref: string;
  registerHref: string;
}) {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <section className="vf-section" aria-live="polite">
        <h2>Checking your account</h2>
        <p className="vf-muted">One moment while vFurst verifies your session.</p>
      </section>
    );
  }

  if (status !== "authenticated") {
    return (
      <section className="vf-section">
        <p className="vf-label">Public account required</p>
        <h2>Sign in before continuing</h2>
        <p className="vf-muted">
          Your registration, payment, and application history will be saved to your central vFurst account.
        </p>
        <div className="vf-actions">
          <Button label="Log in" href={loginHref} variant="primary" />
          <Button label="Create account" href={registerHref} />
        </div>
      </section>
    );
  }

  return children;
}
