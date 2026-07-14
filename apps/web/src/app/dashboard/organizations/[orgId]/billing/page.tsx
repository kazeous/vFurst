import { runFeeReconciliation } from "@/actions/saas-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getOrganizationFeeReport } from "@/lib/billing/reports";
import { requireOrgPageAccess } from "@/lib/dashboard-access";
import { formatCurrency } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
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
  await requireOrgPageAccess(orgId);

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
          <p className="vf-muted">
            Read-only reporting for fees collected through Stripe Connect and centrally settled VND payments.
          </p>
        </div>
        <form action={runFeeReconciliation}>
          <input type="hidden" name="orgId" value={org.id} />
          <Button label="Run reconciliation" type="submit" variant="primary" />
        </form>
      </header>
      {reconciled ? <div className="vf-banner vf-banner-success">Reconciliation queued at {reconciled}.</div> : null}
      {report.currencyMismatchCount > 0 ? (
        <div className="vf-banner vf-banner-warning">
          {report.currencyMismatchCount} paid order(s) use a different currency from their event. They remain separated by
          order currency below and should be reviewed.
        </div>
      ) : null}
      {report.currencies.map((currencyReport) => (
        <section key={currencyReport.currency} className="vf-stack">
          <div>
            <p className="vf-label">{currencyReport.currency} settlement</p>
            <h2>{currencyReport.currency} fee report</h2>
          </div>
          <div className="vf-stat-grid">
            <div className="vf-stat-card">
              <p className="vf-label">Expected fees</p>
              <strong>{formatCurrency(currencyReport.expectedTotal, currencyReport.currency)}</strong>
              <span>Usage-based audit total</span>
            </div>
            <div className="vf-stat-card">
              <p className="vf-label">Collected fees</p>
              <strong>{formatCurrency(currencyReport.collectedTotal, currencyReport.currency)}</strong>
              <span>Paid order platform fees</span>
            </div>
            <div className="vf-stat-card">
              <p className="vf-label">Store/vendor revenue</p>
              <strong>{formatCurrency(currencyReport.storeVendorRevenue, currencyReport.currency)}</strong>
              <span>1% transaction-fee basis</span>
            </div>
          </div>
          <section className="vf-section">
            <h3>Fee breakdown</h3>
            <div className="vf-table">
              <div className="vf-table-head vf-four-col">
                <span>Fee type</span>
                <span>Basis</span>
                <span>Expected</span>
                <span>Collected</span>
              </div>
              {currencyReport.lines.map((line) => (
                <div key={line.label} className="vf-table-row vf-four-col">
                  <strong>{line.label}</strong>
                  <span>{line.basis}</span>
                  <span>{formatCurrency(line.expected, currencyReport.currency)}</span>
                  <span>{formatCurrency(line.collected, currencyReport.currency)}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="vf-two-column">
            <Card>
              <div className="vf-stack">
                <h3>Discrepancies</h3>
                {currencyReport.discrepancies.map((item) => (
                  <div key={item.message} className={`vf-banner ${item.severity === "warning" ? "vf-banner-warning" : ""}`}>
                    {item.message}
                  </div>
                ))}
                {currencyReport.discrepancies.length === 0 ? (
                  <p className="vf-empty">No discrepancies in this {currencyReport.currency} report.</p>
                ) : null}
              </div>
            </Card>
            <Card>
              <div className="vf-stack">
                <h3>Report details</h3>
                <dl className="vf-details">
                  <dt>Generated</dt>
                  <dd>{report.generatedAt}</dd>
                  <dt>Attendees</dt>
                  <dd>{currencyReport.attendeeCount}</dd>
                  <dt>Hotel bookings</dt>
                  <dd>{currencyReport.hotelBookingCount}</dd>
                </dl>
              </div>
            </Card>
          </section>
          <section className="vf-section">
            <h3>{currencyReport.currency} fee collection history</h3>
            <div className="vf-table">
              <div className="vf-table-head vf-five-col">
                <span>Order</span>
                <span>Event</span>
                <span>Source</span>
                <span>Gross</span>
                <span>Fee</span>
              </div>
              {currencyReport.history.map((entry) => (
                <div key={entry.orderId} className="vf-table-row vf-five-col">
                  <span>{entry.orderId.slice(0, 8)}</span>
                  <span>{entry.eventName}</span>
                  <span>{entry.source}</span>
                  <span>{formatCurrency(entry.gross, currencyReport.currency)}</span>
                  <span>{formatCurrency(entry.platformFee, currencyReport.currency)}</span>
                </div>
              ))}
            </div>
            {currencyReport.history.length === 0 ? <p className="vf-empty">No collected platform fees yet.</p> : null}
          </section>
        </section>
      ))}
      {report.currencies.length === 0 ? <p className="vf-empty">No event currencies or fee activity to report yet.</p> : null}
    </div>
  );
}
