import { refreshStripeStatus, startStripeOnboarding } from "@/actions/stripe-actions";
import { prisma } from "@vfurst/db";
import { Button } from "@astryxdesign/core/Button";
import { notFound } from "next/navigation";

export default async function StripeConnectPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const org = await prisma.organization.findUnique({
    where: {
      id: orgId
    },
    include: {
      stripeConnect: true
    }
  });

  if (!org) {
    notFound();
  }

  return (
    <div className="vf-page vf-narrow">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Payments</p>
          <h1>Stripe Connect</h1>
        </div>
      </header>
      <section className="vf-section">
        <div className="vf-list-row">
          <span>Account</span>
          <small>{org.stripeConnect?.stripeAccountId ?? "Not connected"}</small>
        </div>
        <div className="vf-list-row">
          <span>Status</span>
          <small>{org.stripeConnect?.onboardingComplete ? "Onboarding complete" : "Action required"}</small>
        </div>
        <div className="vf-actions">
          <form action={startStripeOnboarding}>
            <input type="hidden" name="orgId" value={org.id} />
            <Button label="Start onboarding" type="submit" variant="primary" />
          </form>
          <form action={refreshStripeStatus}>
            <input type="hidden" name="orgId" value={org.id} />
            <Button label="Refresh status" type="submit" />
          </form>
        </div>
      </section>
    </div>
  );
}

