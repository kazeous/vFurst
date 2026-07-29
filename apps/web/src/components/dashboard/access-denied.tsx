/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 */
/* Hallmark · component: access-denied screen · genre: modern-minimal · theme: Operational Calm */

import { Button } from "@/components/ui/button";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";

type DashboardAccessDeniedProps = {
  email?: string | null;
};

export function DashboardAccessDenied({ email }: DashboardAccessDeniedProps) {
  return (
    <main className="vf-access-denied" data-testid="dashboard-access-denied">
      <div className="vf-access-denied-shell">
        <header className="vf-access-denied-header">
          <Link className="vf-access-denied-brand" href="/" aria-label="vFurst home">
            <span aria-hidden="true">vF</span>
            vFurst
          </Link>
          <span className="vf-access-denied-context">Organizer workspace</span>
        </header>

        <section className="vf-access-denied-frame" aria-labelledby="access-denied-title">
          <div className="vf-access-denied-summary">
            <div className="vf-access-denied-icon" aria-hidden="true">
              <TriangleAlert />
            </div>
            <div className="vf-access-denied-copy">
              <h1 id="access-denied-title">Organizer access required</h1>
              <p>
                You’re signed in, but this account hasn’t been added to an organizer workspace.
              </p>
              {email ? (
                <p className="vf-access-denied-identity">
                  Signed in as <strong>{email}</strong>
                </p>
              ) : null}
            </div>
          </div>

          <div className="vf-access-denied-next">
            <div>
              <h2>How to get access</h2>
              <p>
                Ask an organization owner or platform administrator to invite this account as an Owner or Administrator.
              </p>
            </div>
            <div className="vf-access-denied-actions">
              <Button label="Open my account" href="/account" variant="primary" size="lg" />
              <Button label="Return to vFurst" href="/" variant="outline" size="lg" />
            </div>
            <p className="vf-access-denied-note">Organizer access is invite-only.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
