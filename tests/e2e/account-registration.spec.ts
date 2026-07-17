import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const email = `existing-account-${runId}@example.com`;

test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  await prisma.user.create({
    data: {
      email,
      name: "Existing Account",
      passwordHash: await bcrypt.hash("ExistingPassword123!", 12)
    }
  });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test("existing account stays on signup and receives recovery actions", async ({ page }) => {
  await page.goto("/register?returnTo=%2Faccount");
  await page.getByLabel("Name").fill("Duplicate Account");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("AnotherPassword123!");
  await page.getByRole("button", { name: "Create account" }).click();

  const alert = page.getByTestId("register-error");
  await expect(alert).toContainText("An account already exists for this email address.");
  await expect(alert.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login?returnTo=%2Faccount");
  await expect(alert.getByRole("link", { name: "reset your password" })).toHaveAttribute(
    "href",
    "/forgot-password?returnTo=%2Faccount"
  );
  await expect(page).toHaveURL(/\/register\?returnTo=%2Faccount$/);
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
});
