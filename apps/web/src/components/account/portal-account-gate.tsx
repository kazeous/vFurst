"use client";

import { Button } from "@/components/ui/button";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type PortalGateAccount = { email: string; name: string | null };

const PortalGateAccountContext = createContext<PortalGateAccount | undefined>(undefined);

export function usePortalGateAccount(): PortalGateAccount {
  const account = useContext(PortalGateAccountContext);
  if (!account) {
    throw new Error("usePortalGateAccount must be used inside a signed-in PortalAccountGate.");
  }
  return account;
}

export function PortalAccountGate({
  loginHref,
  signupHref,
  children
}: {
  loginHref: string;
  signupHref: string;
  children: ReactNode;
}) {
  const [account, setAccount] = useState<PortalGateAccount | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    fetch("/api/portal/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { account: null }))
      .then((session: { account: PortalGateAccount | null }) => {
        if (active) setAccount(session.account);
      })
      .catch(() => {
        if (active) setAccount(null);
      });
    return () => {
      active = false;
    };
  }, []);

  if (account === undefined) {
    return (
      <section className="vf-section" aria-live="polite">
        <h2>Checking your account</h2>
        <p className="vf-muted">One moment while vFurst verifies your session.</p>
      </section>
    );
  }

  if (!account) {
    return (
      <section className="vf-section">
        <p className="vf-label">Account required</p>
        <h2>Sign in before continuing</h2>
        <p className="vf-muted">
          Your registration, payment, and application history are saved to your account on this portal.
        </p>
        <div className="vf-actions">
          <Button label="Sign in" href={loginHref} variant="primary" />
          <Button label="Create account" href={signupHref} />
        </div>
      </section>
    );
  }

  return <PortalGateAccountContext.Provider value={account}>{children}</PortalGateAccountContext.Provider>;
}
