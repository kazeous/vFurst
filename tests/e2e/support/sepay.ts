import { expect, type Page } from "@playwright/test";
import type { PrismaClient } from "@prisma/client";
import { createHmac, randomUUID } from "node:crypto";

export async function settleSePayOrder(page: Page, prisma: PrismaClient, orderId: string, webhookSecret: string): Promise<void> {
  await page.getByRole("button", { name: "Show QR" }).click();
  await expect.poll(() => prisma.paymentAttempt.count({ where: { orderId, provider: "SEPAY" } }), { timeout: 30_000 }).toBe(1);
  await page.waitForURL((url) => url.pathname === `/checkout/${orderId}` && url.searchParams.get("sepay") === "1", { waitUntil: "load" });
  await expect(page.getByRole("heading", { name: "Complete bank transfer" })).toBeVisible();
  await expect(page.getByRole("img", { name: /SePay QR code/ })).toBeVisible();
  const attempt = await prisma.paymentAttempt.findFirstOrThrow({ where: { orderId, provider: "SEPAY" } });
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ id: `e2e-sepay-${randomUUID()}`, accountNumber: "123456789", code: null,
    content: `VFURST ${attempt.paymentCode}`, transferType: "in", transferAmount: order.total });
  const signature = `sha256=${createHmac("sha256", webhookSecret).update(`${timestamp}.${body}`).digest("hex")}`;
  const response = await page.request.post("/api/webhooks/sepay", { data: body, headers: {
    "content-type": "application/json", "x-sepay-timestamp": timestamp, "x-sepay-signature": signature
  } });
  expect(response.status()).toBe(200);
  expect(await response.text()).toBe('{"success":true}');
}
