import { expect, test, type Page } from "@playwright/test";
import { PrismaClient, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHmac } from "node:crypto";
import { loginWithCredentials } from "./support/credentials-login";
import { createPortalAccountFixture, loginAsAttendee } from "./support/portal";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "RoutingCheckoutPass123!";
const userEmail = `routing-checkout-${runId}@example.com`;
const orgSlug = `routing-checkout-${runId}`;
const tenantOrigin = `http://${orgSlug}.localhost:3000`;
const checkoutSecret = process.env.CHECKOUT_TOKEN_SECRET ?? "e2e-checkout-token-secret-32-bytes-minimum";
const unsafePersistedToken = `unsafe-persisted-${runId}`;

let userId: string;
let eventId: string;
let cartId: string;
let unsafePersistedOrderId: string;
let previousStripeConfig:
  | { enabled: boolean; settings: Prisma.JsonValue; updatedById: string | null }
  | null;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email: userEmail, name: "Routing Checkout Owner", passwordHash }
  });
  userId = user.id;

  const org = await prisma.organization.create({
    data: {
      name: "Routing Checkout Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: userEmail,
      status: "ACTIVE",
      members: { create: { userId: user.id, role: "OWNER" } },
      stripeConnect: {
        create: {
          stripeAccountId: `acct_routing_${runId}`,
          onboardingComplete: true
        }
      },
      events: {
        create: {
          name: "Routing Checkout Event",
          slug: "routing-checkout-event",
          startDate: new Date("2028-09-01T09:00:00Z"),
          endDate: new Date("2028-09-02T17:00:00Z"),
          status: "PUBLISHED",
          currency: "USD"
        }
      }
    },
    include: { events: true }
  });
  const userAttendee = await createPortalAccountFixture(prisma, { orgId: org.id, email: userEmail, name: "Routing Checkout Owner", password });
  eventId = org.events[0]!.id;

  const product = await prisma.storeProduct.create({
    data: {
      orgId: org.id,
      eventId,
      name: `Routing Product ${runId}`,
      price: 2_500,
      stock: 10
    }
  });
  const cart = await prisma.cart.create({
    data: {
      orgId: org.id,
      eventId,
      portalAccountId: userAttendee.id,
      items: {
        create: {
          orgId: org.id,
          itemType: "PRODUCT",
          refId: product.id,
          storeProductId: product.id,
          unitPrice: product.price,
          quantity: 1
        }
      }
    }
  });
  cartId = cart.id;

  previousStripeConfig = await prisma.paymentProviderConfig.findUnique({
    where: { provider: "STRIPE" },
    select: { enabled: true, settings: true, updatedById: true }
  });
  await prisma.paymentProviderConfig.upsert({
    where: { provider: "STRIPE" },
    create: { provider: "STRIPE", enabled: true, settings: {} },
    update: { enabled: true }
  });

  const unsafeOrder = await prisma.order.create({
    data: {
      orgId: org.id,
      eventId,
      portalAccountId: userAttendee.id,
      total: 2_500,
      platformFee: 25,
      currency: "USD",
      status: "PAID",
      checkoutTokenHash: createHmac("sha256", checkoutSecret).update(unsafePersistedToken).digest("hex"),
      checkoutSuccessPath: "/\\attacker.example",
      checkoutCancelPath: `/store`,
      checkoutExpiresAt: new Date(Date.now() + 30 * 60 * 1000)
    }
  });
  unsafePersistedOrderId = unsafeOrder.id;
});

test.afterAll(async () => {
  if (previousStripeConfig) {
    await prisma.paymentProviderConfig.update({
      where: { provider: "STRIPE" },
      data: {
        enabled: previousStripeConfig.enabled,
        settings: previousStripeConfig.settings as Prisma.InputJsonValue,
        updatedById: previousStripeConfig.updatedById
      }
    });
  } else {
    await prisma.paymentProviderConfig.deleteMany({ where: { provider: "STRIPE" } });
  }

  await prisma.organization.deleteMany({ where: { slug: orgSlug } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
});

async function login(page: Page) {
  await loginWithCredentials(page, userEmail, password);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible({ timeout: 30_000 });
}

test("host probes reject malformed input and keep every reserved platform hostname on the platform", async ({ request }) => {
  for (const [host, expected] of [
    ["localhost:3000", 200],
    ["www.vfurst.reyuugames.com", 200],
    ["console.vfurst.reyuugames.com", 200],
    ["app.vfurst.reyuugames.com", 200],
    ["foo_bar.localhost:3000", 400]
  ] as const) {
    const response = await request.get("/", { headers: { host }, maxRedirects: 0 });
    expect(response.status(), host).toBe(expected);
  }
});

test("portal links use the central host and forged internal headers cannot change the portal root", async ({ page, request }) => {
  await page.goto(tenantOrigin);
  await expect(page.getByRole("link", { name: /Powered by vFurst/ })).toHaveAttribute(
    "href",
    "http://localhost:3000/"
  );
  await expect(page.getByRole("link", { name: "Privacy" })).toHaveAttribute(
    "href",
    "http://localhost:3000/privacy"
  );

  await expect(page.getByRole("navigation", { name: "Convention portal navigation" }).getByRole("link", { name: "Tickets", exact: true })).toHaveAttribute("href", "/register");

  const response = await request.get(`/${orgSlug}`, {
    maxRedirects: 0,
    headers: {
      host: "localhost:3000",
      "x-vfurst-org-host": `${orgSlug}.localhost`,
      "x-vfurst-org-slug": orgSlug,
      "x-vfurst-domain-mode": "subdomain"
    }
  });
  expect(response.status()).toBe(308);
  expect(response.headers().location).toBe(`${tenantOrigin}/`);
  expect(response.headers()["x-vfurst-org-host"]).toBeUndefined();
});

test("dashboard Log out ends the session and returns to the marketing home", async ({ page }) => {
  await login(page);
  await page.locator(".vf-app-user-trigger").click();
  await Promise.all([
    page.waitForURL((url) => url.hostname === "localhost" && url.pathname === "/"),
    page.getByRole("button", { name: "Log out" }).click()
  ]);

  await page.goto("/dashboard");
  await page.waitForURL((url) => url.pathname === "/login");
});

test("tenant-host store checkout stays on the portal, rejects a forged return path, and returns to the portal", async ({
  page
}) => {
  await loginAsAttendee(page, { subdomain: orgSlug }, userEmail, { password });
  const tenantStoreUrl = `${tenantOrigin}/store`;
  await page.goto(tenantStoreUrl);

  let checkoutForm = page.getByRole("button", { name: "Checkout" }).locator("xpath=ancestor::form");
  await expect(checkoutForm.locator('input[name="successPath"]')).toHaveValue(`/store`);
  await expect(checkoutForm.locator('input[name="cancelPath"]')).toHaveValue(`/store`);

  const rejectedResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/store" && response.request().method() === "POST"
  );
  await checkoutForm.evaluate((formElement) => {
    const form = formElement as HTMLFormElement;
    const successPath = form.querySelector<HTMLInputElement>('input[name="successPath"]');
    if (!successPath) throw new Error("Checkout successPath input is missing.");
    successPath.value = "/\\attacker.example";
    form.requestSubmit();
  });
  await rejectedResponse;
  expect(await prisma.order.count({ where: { cartId } })).toBe(0);

  await page.goto(tenantStoreUrl);
  checkoutForm = page.getByRole("button", { name: "Checkout" }).locator("xpath=ancestor::form");
  await Promise.all([
    page.waitForURL((url) => url.origin === tenantOrigin && url.pathname.startsWith("/checkout/")),
    checkoutForm.getByRole("button", { name: "Checkout" }).click()
  ]);
  await expect(page.getByRole("heading", { name: "Choose how to pay" })).toBeVisible({ timeout: 30_000 });

  const order = await prisma.order.findFirstOrThrow({ where: { cartId }, orderBy: { createdAt: "desc" } });
  expect(order.checkoutSuccessPath).toBe(`/store?success=${order.id}`);
  expect(order.checkoutCancelPath).toBe(`/store?cancelled=1`);
  expect(new URL(page.url()).origin).toBe(tenantOrigin);

  await prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });
  await page.reload();
  await expect(page.getByRole("heading", { name: "You are all set" })).toBeVisible({ timeout: 30_000 });
  await Promise.all([
    page.waitForURL(
      (url) => url.origin === tenantOrigin && url.pathname === `/store` && url.searchParams.get("success") === order.id
    ),
    page.getByRole("link", { name: "Continue to confirmation" }).click()
  ]);
  await expect(page.getByRole("heading", { name: "Order received" })).toBeVisible({ timeout: 30_000 });
});

test("an unsafe return path already stored in the database is replaced on both read surfaces", async ({ page, request }) => {
  const statusResponse = await request.get(
    `/api/payments/orders/${unsafePersistedOrderId}/status?token=${encodeURIComponent(unsafePersistedToken)}`
  );
  expect(statusResponse.status()).toBe(200);
  await expect(statusResponse.json()).resolves.toMatchObject({
    status: "PAID",
    successPath: "/account/orders"
  });

  await page.goto(`${tenantOrigin}/checkout/${unsafePersistedOrderId}?token=${encodeURIComponent(unsafePersistedToken)}`);
  await expect(page.getByRole("link", { name: "Continue to confirmation" })).toHaveAttribute(
    "href",
    "/account/orders"
  );
});
