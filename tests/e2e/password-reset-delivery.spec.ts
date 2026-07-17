import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const oldPassword = "PasswordResetOld123!";
const newPassword = "PasswordResetNew123!";
const email = `password-reset-delivery-${runId}@example.com`;

type MailpitMessage = {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
};

type MailpitMessageDetail = MailpitMessage & {
  HTML: string;
  Text: string;
};

test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

async function findResetMail() {
  const response = await fetch("http://127.0.0.1:8025/api/v1/messages");
  if (!response.ok) return null;
  const body = (await response.json()) as { messages?: MailpitMessage[] };
  return body.messages?.find(
    (message) => message.Subject === "Reset your vFurst password" && message.To.some((entry) => entry.Address === email)
  ) ?? null;
}

async function login(page: Page, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test.beforeAll(async () => {
  await prisma.user.create({
    data: {
      email,
      name: "Password Reset Attendee",
      passwordHash: await bcrypt.hash(oldPassword, 12)
    }
  });
});

test.afterAll(async () => {
  await prisma.emailDelivery.deleteMany({ where: { recipient: email } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test("forgot-password delivers a real SMTP reset link and the link is consumed once", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If an account exists for that email, a one-hour reset link has been sent.")).toBeVisible();

  await expect.poll(async () => Boolean(await findResetMail()), { timeout: 20_000 }).toBe(true);
  const message = await findResetMail();
  if (!message) throw new Error("Password reset email was not delivered to Mailpit.");
  const detailResponse = await fetch(`http://127.0.0.1:8025/api/v1/message/${message.ID}`);
  expect(detailResponse.ok).toBe(true);
  const detail = (await detailResponse.json()) as MailpitMessageDetail;
  const resetUrl = detail.Text.match(/https?:\/\/[^\s]+/)?.[0];
  expect(resetUrl).toBeTruthy();
  expect(detail.HTML).toContain("Reset password");
  expect(detail.Text).toContain("Use this secure link to reset your password:");

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const storedToken = await prisma.verificationToken.findFirstOrThrow({
    where: { identifier: `password-reset:${user.id}` }
  });
  const rawToken = new URL(resetUrl!).searchParams.get("token");
  expect(rawToken).toBeTruthy();
  expect(storedToken.token).toBe(createHash("sha256").update(rawToken!).digest("hex"));
  expect(storedToken.token).not.toBe(rawToken);

  await page.goto(resetUrl!);
  await page.getByLabel("New password").fill(newPassword);
  await page.getByLabel("Confirm password").fill(newPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login\?reset=1/);

  await login(page, newPassword);
  await expect(page).toHaveURL(/\/(account|dashboard)/);

  await page.goto(resetUrl!);
  await page.getByLabel("New password").fill("PasswordResetReplay123!");
  await page.getByLabel("Confirm password").fill("PasswordResetReplay123!");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("This reset link is invalid, expired, or has already been used.")).toBeVisible();
  await expect(prisma.verificationToken.count({ where: { identifier: `password-reset:${user.id}` } })).resolves.toBe(0);
});
