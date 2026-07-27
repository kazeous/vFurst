import { startSePayPayment, startStripePayment } from "@/actions/checkout-actions";
import { PaymentStatusPoller } from "@/app/checkout/[orderId]/payment-status-poller";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getEffectiveEventBranding } from "@/lib/event-branding";
import { formatDate } from "@/lib/i18n";
import { requireCheckoutOrder } from "@/lib/payments/checkout";
import { safeCheckoutReturnPath } from "@/lib/payments/checkout-return-path";
import { getEligiblePaymentProviders, getSePaySettings } from "@/lib/payments/platform";
import { getSePayMemo, getSePayQrUrl } from "@/lib/payments/sepay";
import { formatCurrency } from "@/lib/registration/pricing";
import { Building2, Check, Copy, CreditCard, LockKeyhole, QrCode, ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";

function checkoutItemLabel(itemType: string) {
  if (itemType === "REGISTRATION") return "Convention registration";
  if (itemType === "ADDON") return "Registration add-on";
  if (itemType === "PRODUCT") return "Store item";
  if (itemType === "HOTEL") return "Hotel reservation";
  if (itemType === "VENDOR") return "Vendor booth";
  return "Order item";
}

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ token?: string; cancelled?: string; returned?: string; expired?: string }> }) {
  const { orderId } = await params;
  const { token = "", cancelled, returned, expired } = await searchParams;
  const order = await requireCheckoutOrder(orderId, token);
  const providers = await getEligiblePaymentProviders(order.orgId, order.currency);
  const activeAttempt =
    order.paymentAttempts.find((attempt) => attempt.status === "REVIEW") ??
    order.paymentAttempts.find((attempt) => attempt.status === "PENDING" && attempt.expiresAt > new Date());
  const sepaySettings = activeAttempt?.provider === "SEPAY" ? await getSePaySettings() : null;
  const branding = getEffectiveEventBranding(order.event.settings, order.org.logo);
  const style = { "--event-accent": branding.accentColor, "--event-accent-foreground": branding.accentForeground } as CSSProperties;
  const logoStyle = branding.logoUrl ? { backgroundImage: `url("${branding.logoUrl.replaceAll('"', "%22")}")` } : undefined;
  const confirmingStripePayment = returned === "stripe" && activeAttempt?.provider === "STRIPE" && activeAttempt.status === "PENDING";

  if (order.status === "PAID" && order.checkoutSuccessPath) {
    const successPath = safeCheckoutReturnPath(order.checkoutSuccessPath);

    return (
      <main className="vf-checkout-shell vf-checkout-complete" style={style}>
        <section className="vf-checkout-complete-card">
          <span className="vf-checkout-success-icon"><Check size={28} /></span>
          <p className="vf-label">Payment confirmed</p>
          <h1>You are all set</h1>
          <p>Your order for {order.event.name} is paid and ready.</p>
          <Button label="Continue to confirmation" href={successPath} variant="primary" />
        </section>
      </main>
    );
  }

  return (
    <main className="vf-checkout-shell" style={style}>
      <header className="vf-checkout-header">
        <div className="vf-checkout-brand"><span style={logoStyle}>{branding.logoUrl ? null : order.event.name.slice(0, 2).toUpperCase()}</span><div><strong>{order.event.name}</strong><small>Secure checkout by vFurst</small></div></div>
        <div className="vf-checkout-security"><ShieldCheck size={17} /><span>Encrypted checkout</span></div>
      </header>

      <div className="vf-checkout-layout">
        <section className="vf-checkout-payment">
          <div className="vf-checkout-heading"><p className="vf-label">Secure checkout</p><h1>{activeAttempt?.status === "REVIEW" ? "Payment under review" : activeAttempt?.provider === "SEPAY" ? "Complete bank transfer" : activeAttempt?.provider === "STRIPE" ? "Continue card payment" : "Choose how to pay"}</h1><p>Order {order.id.slice(0, 8).toUpperCase()}</p></div>
          {cancelled ? <Alert variant="warning">Stripe checkout was cancelled. No payment was captured.</Alert> : null}
          {expired ? <Alert variant="warning">The previous Stripe checkout expired. You can start a new payment attempt below.</Alert> : null}

          {confirmingStripePayment ? (
            <div>
              <Alert variant="info">Stripe returned you to vFurst. We are confirming the payment before showing the next step.</Alert>
              <PaymentStatusPoller orderId={order.id} token={token} message="Waiting for Stripe confirmation. This page checks automatically every three seconds." />
            </div>
          ) : activeAttempt?.status === "REVIEW" ? (
            <Alert variant="warning">A received payment is under platform review. Do not send another payment while this review is open.</Alert>
          ) : activeAttempt?.provider === "SEPAY" && activeAttempt.paymentCode && sepaySettings ? (
            <div className="vf-sepay-payment-card">
              <div className="vf-sepay-qr-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={getSePayQrUrl(sepaySettings, order.total, activeAttempt.paymentCode)} alt={`SePay QR code for ${formatCurrency(order.total, "VND")}`} width="420" height="520" />
              </div>
              <div className="vf-sepay-instructions">
                <div><span className="vf-checkout-method-icon"><QrCode size={20} /></span><div><h2>Scan with your banking app</h2><p>The page updates automatically when the transfer arrives.</p></div></div>
                <dl className="vf-payment-details">
                  <div><dt>Bank</dt><dd>{sepaySettings.bankCode}</dd></div>
                  <div><dt>Account holder</dt><dd>{sepaySettings.accountHolder}</dd></div>
                  <div><dt>Account number</dt><dd>{sepaySettings.accountNumber}</dd></div>
                  <div><dt>Exact amount</dt><dd>{formatCurrency(order.total, "VND")}</dd></div>
                  <div><dt>Transfer memo</dt><dd><code>{getSePayMemo(sepaySettings, activeAttempt.paymentCode)}</code><Copy size={14} aria-hidden="true" /></dd></div>
                  <div><dt>Reservation expires</dt><dd>{formatDate(activeAttempt.expiresAt, { dateStyle: "medium", timeStyle: "short" })}</dd></div>
                </dl>
                <PaymentStatusPoller orderId={order.id} token={token} />
              </div>
            </div>
          ) : (
            <div className="vf-payment-methods">
              {providers.length === 0 ? <Alert variant="warning">Paid checkout is temporarily unavailable for this event.</Alert> : null}
              {providers.includes("STRIPE") && (!activeAttempt || activeAttempt.provider === "STRIPE") ? (
                <form action={startStripePayment} className="vf-payment-method-card">
                  <input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="token" value={token} />
                  <span className="vf-checkout-method-icon"><CreditCard size={21} /></span>
                  <div><h2>Card with Stripe</h2><p>{activeAttempt ? "Continue the active Stripe checkout for this order." : "Pay securely with a credit or debit card."}</p><small>Card details stay with Stripe.</small></div>
                  <Button label={activeAttempt ? "Continue active payment" : "Continue"} type="submit" variant="primary" />
                </form>
              ) : null}
              {providers.includes("SEPAY") && !activeAttempt ? (
                <form action={startSePayPayment} className="vf-payment-method-card">
                  <input type="hidden" name="orderId" value={order.id} /><input type="hidden" name="token" value={token} />
                  <span className="vf-checkout-method-icon"><QrCode size={21} /></span>
                  <div><h2>SePay bank transfer</h2><p>Scan a VietQR code and pay from your banking app.</p><small>Available for VND orders.</small></div>
                  <Button label="Show QR" type="submit" variant="primary" />
                </form>
              ) : null}
            </div>
          )}
          <div className="vf-checkout-protection"><LockKeyhole size={17} /><span><strong>Protected payment</strong> vFurst never stores card numbers or online-banking credentials.</span></div>
        </section>

        <aside className="vf-checkout-summary" aria-label="Order summary">
          <div><p className="vf-label">Order summary</p><h2>{order.event.name}</h2><span><Building2 size={14} />{order.org.name}</span></div>
          <div className="vf-checkout-items">
            {order.items.map((item) => <div key={item.id}><span>{checkoutItemLabel(item.itemType)}<small>Quantity {item.quantity}</small></span><strong>{formatCurrency(item.unitPrice * item.quantity, order.currency)}</strong></div>)}
          </div>
          <dl className="vf-checkout-totals"><div><dt>Subtotal</dt><dd>{formatCurrency(Math.max(order.total - order.platformFee, 0), order.currency)}</dd></div>{order.platformFee > 0 ? <div><dt>Platform fee</dt><dd>{formatCurrency(order.platformFee, order.currency)}</dd></div> : null}<div><dt>Total</dt><dd>{formatCurrency(order.total, order.currency)}</dd></div></dl>
          <small>Inventory is reserved while this checkout remains active.</small>
        </aside>
      </div>
    </main>
  );
}
