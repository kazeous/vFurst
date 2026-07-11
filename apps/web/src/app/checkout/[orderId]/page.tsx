import { startSePayPayment, startStripePayment } from "@/actions/checkout-actions";
import { PaymentStatusPoller } from "@/app/checkout/[orderId]/payment-status-poller";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/registration/pricing";
import { requireCheckoutOrder } from "@/lib/payments/checkout";
import { getEligiblePaymentProviders, getSePaySettings } from "@/lib/payments/platform";
import { getSePayMemo, getSePayQrUrl } from "@/lib/payments/sepay";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  params,
  searchParams
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string; cancelled?: string }>;
}) {
  const { orderId } = await params;
  const { token = "", cancelled } = await searchParams;
  const order = await requireCheckoutOrder(orderId, token);
  const providers = await getEligiblePaymentProviders(order.orgId, order.currency);
  const activeAttempt = order.paymentAttempts.find((attempt) => attempt.status === "PENDING" && attempt.expiresAt > new Date());
  const sepaySettings = activeAttempt?.provider === "SEPAY" ? await getSePaySettings() : null;

  if (order.status === "PAID" && order.checkoutSuccessPath) {
    return (
      <main className="vf-public-page vf-narrow">
        <Card>
          <h1>Payment confirmed</h1>
          <p>Your order is paid and ready.</p>
          <Button label="Continue" href={order.checkoutSuccessPath} variant="primary" />
        </Card>
      </main>
    );
  }

  return (
    <main className="vf-public-page vf-narrow">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Secure checkout</p>
          <h1>{order.event.name}</h1>
          <p className="vf-muted">Order {order.id.slice(0, 8).toUpperCase()}</p>
        </div>
        <strong>{formatCurrency(order.total, order.currency)}</strong>
      </header>

      {cancelled ? <div className="vf-banner vf-banner-warning">The Stripe checkout was cancelled. No payment was captured.</div> : null}

      {activeAttempt?.provider === "SEPAY" && activeAttempt.paymentCode && sepaySettings ? (
        <Card>
          <div className="vf-stack">
            <h2>Scan to pay with SePay</h2>
            <img
              src={getSePayQrUrl(sepaySettings, order.total, activeAttempt.paymentCode)}
              alt={`SePay QR code for ${formatCurrency(order.total, "VND")}`}
              width="420"
              height="520"
            />
            <dl className="vf-details">
              <dt>Bank</dt><dd>{sepaySettings.bankCode}</dd>
              <dt>Account holder</dt><dd>{sepaySettings.accountHolder}</dd>
              <dt>Account number</dt><dd>{sepaySettings.accountNumber}</dd>
              <dt>Amount</dt><dd>{formatCurrency(order.total, "VND")}</dd>
              <dt>Transfer memo</dt><dd><code>{getSePayMemo(sepaySettings, activeAttempt.paymentCode)}</code></dd>
              <dt>Expires</dt><dd>{activeAttempt.expiresAt.toLocaleString()}</dd>
            </dl>
            <PaymentStatusPoller orderId={order.id} token={token} />
          </div>
        </Card>
      ) : (
        <Card>
          <div className="vf-stack">
            <h2>Choose a payment method</h2>
            {providers.length === 0 ? (
              <div className="vf-banner vf-banner-warning">Paid checkout is temporarily unavailable for this event.</div>
            ) : null}
            {providers.includes("STRIPE") ? (
              <form action={startStripePayment}>
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="token" value={token} />
                <Button label="Pay with Stripe" type="submit" variant="primary" />
              </form>
            ) : null}
            {providers.includes("SEPAY") ? (
              <form action={startSePayPayment}>
                <input type="hidden" name="orderId" value={order.id} />
                <input type="hidden" name="token" value={token} />
                <Button label="Pay with SePay QR" type="submit" variant="primary" />
              </form>
            ) : null}
          </div>
        </Card>
      )}
    </main>
  );
}
