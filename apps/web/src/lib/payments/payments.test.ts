import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createCheckoutToken, verifyCheckoutToken } from "@/lib/payments/checkout-token";
import { selectEligiblePaymentProviders } from "@/lib/payments/platform";
import {
  createSePayPaymentCode,
  extractSePayPaymentCode,
  getSePayMemo,
  getSePayQrUrl,
  verifySePaySignature
} from "@/lib/payments/sepay";
import { organizerNetAmount } from "@/lib/payments/ledger";
import { formatCurrency, parseMoney } from "@/lib/registration/pricing";

const originalWebhookSecret = process.env.SEPAY_WEBHOOK_SECRET;

afterEach(() => {
  process.env.SEPAY_WEBHOOK_SECRET = originalWebhookSecret;
});

describe("currency amounts", () => {
  it("stores USD in cents and VND in whole dong", () => {
    expect(parseMoney("12.34", "USD")).toBe(1234);
    expect(parseMoney("125000", "VND")).toBe(125000);
    expect(() => parseMoney("12.50", "VND")).toThrow();
    expect(formatCurrency(125000, "VND")).toMatch(/125[.,]000/);
  });
});

describe("provider availability", () => {
  it("excludes SePay for USD and permits both providers for configured VND checkout", () => {
    const common = {
      stripeEnabled: true,
      stripeConfigured: true,
      stripeConnected: true,
      sepayEnabled: true,
      sepayConfigured: true
    };
    expect(selectEligiblePaymentProviders({ currency: "USD", ...common })).toEqual(["STRIPE"]);
    expect(selectEligiblePaymentProviders({ currency: "VND", ...common })).toEqual(["STRIPE", "SEPAY"]);
    expect(selectEligiblePaymentProviders({ currency: "VND", ...common, stripeEnabled: false, sepayEnabled: false })).toEqual([]);
  });
});

describe("secure checkout context", () => {
  it("accepts only the token that produced the stored hash", () => {
    const checkout = createCheckoutToken();
    expect(verifyCheckoutToken(checkout.token, checkout.hash)).toBe(true);
    expect(verifyCheckoutToken(`${checkout.token}x`, checkout.hash)).toBe(false);
  });
});

describe("SePay VietQR", () => {
  const settings = {
    bankCode: "VCB",
    accountNumber: "123456789",
    accountHolder: "VFURST PLATFORM",
    bankAccountId: "sepay-account-1",
    memoPrefix: "VFURST",
    registrationFeeVnd: 25000,
    hotelFeeVnd: 25000
  };

  it("creates an unambiguous unique-looking code and embeds exact QR parameters", () => {
    const code = createSePayPaymentCode();
    expect(code).toMatch(/^VF[A-F0-9]{12}$/);
    expect(getSePayMemo(settings, code)).toBe(`VFURST ${code}`);
    const qr = new URL(getSePayQrUrl(settings, 150000, code));
    expect(qr.origin + qr.pathname).toBe("https://vietqr.app/img");
    expect(qr.searchParams.get("acc")).toBe(settings.accountNumber);
    expect(qr.searchParams.get("bank")).toBe(settings.bankCode);
    expect(qr.searchParams.get("amount")).toBe("150000");
    expect(qr.searchParams.get("des")).toContain(code);
  });

  it("extracts the payment code from either SePay code or transfer content", () => {
    const paymentCode = "VF0123456789AB";
    expect(extractSePayPaymentCode(paymentCode, null)).toBe(paymentCode);
    expect(extractSePayPaymentCode(null, `payment vfurst ${paymentCode} thanks`)).toBe(paymentCode);
    expect(extractSePayPaymentCode(null, "unmatched transfer")).toBeNull();
  });
});

describe("SePay webhook signatures", () => {
  it("verifies the raw body and rejects stale timestamps", () => {
    process.env.SEPAY_WEBHOOK_SECRET = "test-webhook-secret";
    const body = JSON.stringify({ id: 123, transferAmount: 100000 });
    const now = Date.UTC(2026, 6, 11, 0, 0, 0);
    const timestamp = String(Math.floor(now / 1000));
    const signature = `sha256=${createHmac("sha256", process.env.SEPAY_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest("hex")}`;
    expect(verifySePaySignature(body, timestamp, signature, now)).toBe(true);
    expect(verifySePaySignature(`${body} `, timestamp, signature, now)).toBe(false);
    expect(verifySePaySignature(body, timestamp, signature, now + 301000)).toBe(false);
  });
});

describe("organizer ledger", () => {
  it("credits the paid total less the platform fee without going negative", () => {
    expect(organizerNetAmount(250000, 25000)).toBe(225000);
    expect(organizerNetAmount(100, 200)).toBe(0);
  });
});
