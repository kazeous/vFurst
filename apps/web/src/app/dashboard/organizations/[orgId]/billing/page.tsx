import { runFeeReconciliation } from "@/actions/saas-actions";
import { getOrganizationFeeReport } from "@/lib/billing/reports";
import { requireOrgAccess } from "@/lib/dashboard-access";
import { formatCurrency } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BillingPage({
  params,
  searchParams
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ reconciled?: string }>;
}) {
  const { orgId } = await params;
  const { reconciled } = await searchParams;
  await requireOrgAccess(orgId);

  const org = await prisma.organization.findUnique({
    where: {
      id: orgId
    }
  });

  if (!org) {
    notFound();
  }

  const report = await getOrganizationFeeReport(org.id);

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Usage dashboard</p>
          <h1>{org.name} billing</h1>
          <p className="vf-muted">Read-only reporting for fees already collected through Stripe Connect application fees.</p>
        </div>
        <form action={runFeeReconciliation}>
          <input type="hidden" name="orgId" value={org.id} />
          <Button label="Run reconciliation" type="submit" variant="primary" />
        </form>
      </header>
      {reconciled ? <div className="vf-banner vf-banner-success">Reconciliation queued at {reconciled}.</div> : null}
      <section className="vf-stat-grid">
        <div className="vf-stat-card">
          <p className="vf-label">Expected fees</p>
          <strong>{formatCurrency(report.expectedTotal)}</strong>
          <span>Usage-based audit total</span>
        </div>
        <div className="vf-stat-card">
          <p className="vf-label">Collected fees</p>
          <strong>{formatCurrency(report.collectedTotal)}</strong>
          <span>Paid order platform fees</span>
        </div>
        <div className="vf-stat-card">
          <p className="vf-label">Store/vendor revenue</p>
          <strong>{formatCurrency(report.storeVendorRevenue)}</strong>
          <span>1% transaction-fee basis</span>
        </div>
      </section>
      <section className="vf-section">
        <h2>Fee breakdown</h2>
        <div className="vf-table">
          <div className="vf-table-head vf-four-col">
            <span>Fee type</span>
            <span>Basis</span>
            <span>Expected</span>
            <span>Collected</span>
          </div>
          {report.lines.map((line) => (
            <div key={line.label} className="vf-table-row vf-four-col">
              <strong>{line.label}</strong>
              <span>{line.basis}</span>
              <span>{formatCurrency(line.expected)}</span>
              <span>{formatCurrency(line.collected)}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="vf-two-column">
        <Card>
          <div className="vf-stack">
            <h2>Discrepancies</h2>
            {report.discrepancies.map((item) => (
              <div key={item.message} className={`vf-banner ${item.severity === "warning" ? "vf-banner-warning" : ""}`}>
                {item.message}
              </div>
            ))}
            {report.discrepancies.length === 0 ? <p className="vf-empty">No discrepancies in the current reconciliation report.</p> : null}
          </div>
        </Card>
        <Card>
          <div className="vf-stack">
            <h2>Report details</h2>
            <dl className="vf-details">
              <dt>Generated</dt>
              <dd>{report.generatedAt}</dd>
              <dt>Attendees</dt>
              <dd>{report.attendeeCount}</dd>
              <dt>Hotel bookings</dt>
              <dd>{report.hotelBookingCount}</dd>
            </dl>
          </div>
        </Card>
      </section>
      <section className="vf-section">
        <h2>Fee collection history</h2>
        <div className="vf-table">
          <div className="vf-table-head vf-five-col">
            <span>Order</span>
            <span>Event</span>
            <span>Source</span>
            <span>Gross</span>
            <span>Fee</span>
          </div>
          {report.history.map((entry) => (
            <div key={entry.orderId} className="vf-table-row vf-five-col">
              <span>{entry.orderId.slice(0, 8)}</span>
              <span>{entry.eventName}</span>
              <span>{entry.source}</span>
              <span>{formatCurrency(entry.gross)}</span>
              <span>{formatCurrency(entry.platformFee)}</span>
            </div>
          ))}
        </div>
        {report.history.length === 0 ? <p className="vf-empty">No collected platform fees yet.</p> : null}
      </section>
    </div>
  );
}
