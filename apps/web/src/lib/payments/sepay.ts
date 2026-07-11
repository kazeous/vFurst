import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SePaySettings } from "@/lib/payments/platform";

export function createSePayPaymentCode() {
  return `VF${randomBytes(6).toString("hex").toUpperCase()}`;
}

export function extractSePayPaymentCode(code: string | null, content: string | null) {
  const candidates = [code, content].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    const match = candidate.toUpperCase().match(/(?:^|[^A-Z0-9])(VF[A-F0-9]{12})(?:$|[^A-Z0-9])/);
    if (match) {
      return match[1];
    }
  }
  return null;
}

export function getSePayMemo(settings: SePaySettings, paymentCode: string) {
  return [settings.memoPrefix, paymentCode].filter(Boolean).join(" ");
}

export function getSePayQrUrl(settings: SePaySettings, amount: number, paymentCode: string) {
  const params = new URLSearchParams({
    acc: settings.accountNumber,
    bank: settings.bankCode,
    amount: String(amount),
    des: getSePayMemo(settings, paymentCode),
    template: "compact",
    showinfo: "true",
    fullacc: "true",
    holder: settings.accountHolder,
    store: "vFurst"
  });

  return `https://vietqr.app/img?${params.toString()}`;
}

export function verifySePaySignature(rawBody: string, timestamp: string | null, signature: string | null, now = Date.now()) {
  const secret = process.env.SEPAY_WEBHOOK_SECRET;

  if (!secret || !timestamp || !signature || !/^\d+$/.test(timestamp)) {
    return false;
  }

  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
