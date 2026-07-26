"use client";

import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type RouteErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
  /** Absolute escape-hatch destination. When omitted, a history "Go back" button is rendered instead (for host-relative surfaces like the tenant portal). */
  homeHref?: string;
  homeLabel?: string;
};

export function RouteError({ error, reset, homeHref, homeLabel }: RouteErrorProps) {
  const router = useRouter();
  const detail = process.env.NODE_ENV === "development" && error.message ? error.message : null;

  return (
    <div className="vf-page" data-testid="route-error">
      <Card maxWidth={520}>
        <div className="vf-stack">
          <div>
            <p className="vf-label">Something went wrong</p>
            <h1>This action could not be completed</h1>
          </div>
          <Alert variant="error">
            {detail ?? "The server reported an unexpected error. Trying again often resolves it; if it keeps failing, contact support with the reference below."}
          </Alert>
          {error.digest ? <p className="vf-muted">Reference: <code>{error.digest}</code></p> : null}
          <div className="vf-actions">
            <Button label="Try again" variant="primary" type="button" onClick={() => reset()} />
            {homeHref ? (
              <Button label={homeLabel ?? "Back to home"} href={homeHref} />
            ) : (
              <Button label="Go back" type="button" onClick={() => router.back()} />
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
