"use client";

import { Button } from "@/components/ui/button";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type PortalGateAccount = { email: string; name: string | null };

const PortalGateAccountContext = createContext<PortalGateAccount | undefined>(undefined);
type PortalGateSession = { session: unknown; refresh: () => Promise<boolean> };
const PortalGateSessionContext = createContext<PortalGateSession | undefined>(undefined);

function accountFromSession(session: unknown): PortalGateAccount | null {
  return (session as { account?: PortalGateAccount | null } | null)?.account ?? null;
}

export function usePortalGateAccount(): PortalGateAccount {
  const account = useContext(PortalGateAccountContext);
  if (!account) {
    throw new Error("usePortalGateAccount must be used inside a signed-in PortalAccountGate.");
  }
  return account;
}

export function usePortalGateSession(): PortalGateSession {
  const session = useContext(PortalGateSessionContext);
  if (!session) {
    throw new Error("usePortalGateSession must be used inside a signed-in PortalAccountGate.");
  }
  return session;
}

export function PortalAccountGate({
  loginHref,
  signupHref,
  sessionUrl = "/api/portal/session",
  children
}: {
  loginHref: string;
  signupHref: string;
  sessionUrl?: string;
  children: ReactNode;
}) {
  const [account, setAccount] = useState<PortalGateAccount | null | undefined>(undefined);
  const [session, setSession] = useState<unknown>(null);
  const loadSession = useCallback(async (): Promise<unknown> => {
    const response = await fetch(sessionUrl, { cache: "no-store" });
    return response.json();
  }, [sessionUrl]);
  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const body = await loadSession();
      setSession(body);
      setAccount(accountFromSession(body));
      return true;
    } catch {
      return false;
    }
  }, [loadSession]);
  const sessionContext = useMemo(() => ({ session, refresh }), [session, refresh]);

  useEffect(() => {
    let active = true;
    loadSession()
      .then((body) => {
        if (active) {
          setSession(body);
          setAccount(accountFromSession(body));
        }
      })
      .catch(() => {
        if (active) setAccount(null);
      });
    return () => {
      active = false;
    };
  }, [loadSession]);

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

  return <PortalGateAccountContext.Provider value={account}>
    <PortalGateSessionContext.Provider value={sessionContext}>{children}</PortalGateSessionContext.Provider>
  </PortalGateAccountContext.Provider>;
}
