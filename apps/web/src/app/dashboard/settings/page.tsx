import { recordOrganizerPayout, recordSePayRefund, resolvePaymentException, savePlatformPaymentSettings } from "@/actions/payment-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireDashboardUser } from "@/lib/dashboard-access";
import { getProviderStates, getSePaySettings, isSePayEnvironmentReady } from "@/lib/payments/platform";
import { auth } from "@/lib/auth";
import { formatCurrency } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{ paymentsSaved?: string; payoutSaved?: string; refundSaved?: string; exceptionSaved?: string }>;
}) {
  const userId = await requireDashboardUser();
  const { paymentsSaved, payoutSaved, refundSaved, exceptionSaved } = await searchParams;
  const session = await auth();
  const isPlatformAdmin = session?.user.platformRole === "PLATFORM_ADMIN";
  const [memberships, providerStates, sepaySettings, openLedger, refundableOrders, paymentExceptions, recentPayouts] = await Promise.all([
    prisma.orgMember.findMany({
    where: {
      userId,
      role: {
        in: ["OWNER", "ADMIN"]
      }
    },
    include: {
      org: {
        include: {
          events: {
            orderBy: {
              startDate: "desc"
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
    }),
    isPlatformAdmin ? getProviderStates() : null,
    isPlatformAdmin ? getSePaySettings() : null,
    isPlatformAdmin
      ? prisma.organizerLedgerEntry.findMany({
          where: { status: "OPEN" },
          include: { org: true, order: true },
          orderBy: [{ orgId: "asc" }, { createdAt: "asc" }]
        })
      : [],
    isPlatformAdmin
      ? prisma.order.findMany({
          where: { paymentProvider: "SEPAY", status: "PAID", paymentRefund: null },
          include: { org: true, event: true },
          orderBy: { createdAt: "desc" },
          take: 25
        })
      : [],
    isPlatformAdmin
      ? prisma.paymentException.findMany({
          where: { status: "OPEN" },
          include: { order: true, paymentAttempt: true },
          orderBy: { createdAt: "desc" },
          take: 50
        })
      : [],
    isPlatformAdmin
      ? prisma.organizerPayout.findMany({
          include: { org: true },
          orderBy: { paidAt: "desc" },
          take: 20
        })
      : []
  ]);
  type LedgerEntry = (typeof openLedger)[number];
  const ledgerGroups = Object.values(
    openLedger.reduce<Record<string, { org: LedgerEntry["org"]; currency: "USD" | "VND"; entries: LedgerEntry[] }>>(
      (groups, entry) => {
        const key = `${entry.orgId}:${entry.currency}`;
        groups[key] ??= { org: entry.org, currency: entry.currency, entries: [] };
        groups[key].entries.push(entry);
        return groups;
      },
      {}
    )
  );
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Settings</p>
          <h1>Organizer settings</h1>
          <p className="vf-muted">Choose an organization or event to configure.</p>
        </div>
      </header>

      {isPlatformAdmin && providerStates && sepaySettings ? (
        <section className="vf-stack" aria-labelledby="platform-payment-settings">
          <div>
            <p className="vf-label">Platform administration</p>
            <h2 id="platform-payment-settings">Payment methods</h2>
            <p className="vf-muted">These switches control new paid checkout attempts across every organization.</p>
          </div>
          {paymentsSaved === "1" ? <div className="vf-banner vf-banner-success">Platform payment settings saved.</div> : null}
          <Card>
            <form action={savePlatformPaymentSettings} className="vf-form">
              <label className="vf-check">
                <input name="stripeEnabled" type="checkbox" defaultChecked={providerStates.STRIPE.enabled} />
                Enable Stripe platform-wide
              </label>
              <label className="vf-check">
                <input name="sepayEnabled" type="checkbox" defaultChecked={providerStates.SEPAY.enabled} />
                Enable SePay QR platform-wide
              </label>
              <div className={`vf-banner ${isSePayEnvironmentReady() ? "vf-banner-success" : "vf-banner-warning"}`}>
                SePay secrets: {isSePayEnvironmentReady() ? "configured" : "missing required environment variables"}
              </div>
              <div className="vf-form-grid">
                <label>
                  Bank code
                  <input name="bankCode" defaultValue={sepaySettings.bankCode} placeholder="Vietcombank" />
                </label>
                <label>
                  SePay bank account ID
                  <input name="bankAccountId" defaultValue={sepaySettings.bankAccountId} />
                </label>
                <label>
                  Account number
                  <input name="accountNumber" defaultValue={sepaySettings.accountNumber} />
                </label>
                <label>
                  Account holder
                  <input name="accountHolder" defaultValue={sepaySettings.accountHolder} />
                </label>
                <label>
                  Transfer memo prefix
                  <input name="memoPrefix" defaultValue={sepaySettings.memoPrefix} placeholder="SEVQR" />
                </label>
                <label>
                  Registration fee (VND)
                  <input name="registrationFeeVnd" type="number" min="0" step="1" defaultValue={sepaySettings.registrationFeeVnd} />
                </label>
                <label>
                  Hotel fee (VND)
                  <input name="hotelFeeVnd" type="number" min="0" step="1" defaultValue={sepaySettings.hotelFeeVnd} />
                </label>
              </div>
              <Button label="Save payment methods" type="submit" variant="primary" />
            </form>
          </Card>
          <div className="vf-page-header">
            <div>
              <h2>Organizer settlement</h2>
              <p className="vf-muted">Open SePay ledger balances are paid manually and recorded here.</p>
            </div>
            <Button label="Export open ledger CSV" href="/dashboard/settings/payouts/export" />
          </div>
          {payoutSaved === "1" ? <div className="vf-banner vf-banner-success">Organizer payout recorded.</div> : null}
          {ledgerGroups.map((group) => (
            <Card key={`${group.org.id}:${group.currency}`}>
              <form action={recordOrganizerPayout} className="vf-form">
                <input type="hidden" name="orgId" value={group.org.id} />
                <input type="hidden" name="currency" value={group.currency} />
                <h3>{group.org.name} — {group.currency}</h3>
                <p className="vf-muted">
                  {group.org.payoutBankCode && group.org.payoutAccountNumber
                    ? `${group.org.payoutBankCode} ${group.org.payoutAccountNumber} — ${group.org.payoutAccountHolder ?? "holder not provided"}`
                    : "Organizer payout bank details are incomplete."}
                </p>
                {group.entries.map((entry) => (
                  <label key={entry.id} className="vf-check">
                    <input name="entryId" type="checkbox" value={entry.id} defaultChecked />
                    {formatCurrency(entry.amount, entry.currency)} — {entry.type} — order {entry.orderId?.slice(0, 8) ?? "adjustment"}
                  </label>
                ))}
                <div className="vf-form-grid">
                  <label>
                    Payout amount ({group.currency})
                    <input
                      name="amount"
                      type="number"
                      min={group.currency === "USD" ? "0.01" : "1"}
                      step={group.currency === "USD" ? "0.01" : "1"}
                      defaultValue={group.entries.reduce((sum, entry) => sum + entry.amount, 0) / (group.currency === "USD" ? 100 : 1)}
                      required
                    />
                  </label>
                  <label>Bank transfer reference<input name="reference" required /></label>
                  <label>Paid date<input name="paidAt" type="date" defaultValue={today} required /></label>
                </div>
                <Button label="Record payout" type="submit" variant="primary" />
              </form>
            </Card>
          ))}
          {ledgerGroups.length === 0 ? <p className="vf-empty">No open organizer balances.</p> : null}

          <div>
            <h2>Manual SePay refunds</h2>
            <p className="vf-muted">Transfer the refund externally first, then record its bank reference here.</p>
          </div>
          {refundSaved === "1" ? <div className="vf-banner vf-banner-success">SePay refund recorded.</div> : null}
          {refundableOrders.map((order) => (
            <Card key={order.id}>
              <form action={recordSePayRefund} className="vf-form">
                <input type="hidden" name="orderId" value={order.id} />
                <h3>{order.event.name} — {formatCurrency(order.total, order.currency)}</h3>
                <p className="vf-muted">{order.org.name} · order {order.id}</p>
                <div className="vf-form-grid">
                  <label>Refund transfer reference<input name="reference" required /></label>
                  <label>Processed date<input name="processedAt" type="date" defaultValue={today} required /></label>
                </div>
                <label>Reason<input name="reason" /></label>
                <Button label="Record full refund" type="submit" variant="destructive" />
              </form>
            </Card>
          ))}
          {refundableOrders.length === 0 ? <p className="vf-empty">No paid SePay orders are awaiting refund.</p> : null}

          <div>
            <h2>Payment exceptions</h2>
            <p className="vf-muted">Late, unmatched, underpaid, overpaid, and account-mismatched transfers never auto-fulfill.</p>
          </div>
          {exceptionSaved === "1" ? <div className="vf-banner vf-banner-success">Payment exception resolved.</div> : null}
          <div className="vf-list">
            {paymentExceptions.map((exception) => (
              <form key={exception.id} action={resolvePaymentException} className="vf-list-row">
                <input type="hidden" name="exceptionId" value={exception.id} />
                <span>{exception.type}</span>
                <small>{exception.sepayTransactionId ?? "No transaction ID"} · received {exception.receivedAmount ?? "unknown"}</small>
                <input name="note" required placeholder="Resolution note" aria-label={`Resolution note for ${exception.type}`} />
                <select name="status" defaultValue="RESOLVED" aria-label={`Resolution status for ${exception.type}`}>
                  <option value="RESOLVED">Resolved</option>
                  <option value="REFUNDED">Refunded externally</option>
                </select>
                <Button label="Close exception" type="submit" size="sm" />
              </form>
            ))}
            {paymentExceptions.length === 0 ? <p className="vf-empty">No open payment exceptions.</p> : null}
          </div>

          <div>
            <h2>Recent payouts</h2>
            <div className="vf-list">
              {recentPayouts.map((payout) => (
                <div key={payout.id} className="vf-list-row">
                  <span>{payout.org.name} — {formatCurrency(payout.amount, payout.currency)}</span>
                  <small>{payout.reference} · {payout.paidAt.toLocaleDateString()}</small>
                </div>
              ))}
              {recentPayouts.length === 0 ? <p className="vf-empty">No payouts recorded.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {memberships.length > 0 ? (
        <section className="vf-stack" aria-label="Manageable organizations">
          {memberships.map((membership) => (
            <Card key={membership.orgId}>
              <div className="vf-stack">
                <div className="vf-page-header">
                  <div>
                    <p className="vf-label">{membership.role}</p>
                    <h2>{membership.org.name}</h2>
                  </div>
                  <Button label="Organization settings" href={`/dashboard/organizations/${membership.orgId}/settings`} />
                </div>

                <div className="vf-list">
                  {membership.org.events.map((event) => (
                    <div key={event.id} className="vf-list-row">
                      <span>{event.name}</span>
                      <small>{event.status}</small>
                      <Button label="Event settings" href={`/dashboard/events/${event.id}/settings`} size="sm" />
                    </div>
                  ))}
                  {membership.org.events.length === 0 ? <p className="vf-empty">This organization has no events yet.</p> : null}
                </div>
              </div>
            </Card>
          ))}
        </section>
      ) : (
        <section className="vf-section">
          <h2>No settings available</h2>
          <p className="vf-muted">You need an owner or administrator role to manage organization and event settings.</p>
          <Button label="View organizations" href="/dashboard/organizations" variant="primary" />
        </section>
      )}
    </div>
  );
}
