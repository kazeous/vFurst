import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loginWithCredentials } from "./support/credentials-login";
import { createPortalAccountFixture, loginAsAttendee, portalOrigin } from "./support/portal";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "StoreResourcePass123!";
const ownerAEmail = `store-owner-a-${runId}@example.com`;
const ownerBEmail = `store-owner-b-${runId}@example.com`;
const orgASlug = `store-org-a-${runId}`;
const orgBSlug = `store-org-b-${runId}`;
const productAName = `Store Product A ${runId}`;
const productBName = `Store Product B ${runId}`;
const rejectedCreateName = `Rejected foreign product ${runId}`;
const validCreateName = `Valid VND product ${runId}`;
const invalidTypeName = `Rejected SVG product ${runId}`;
const invalidContentsName = `Rejected forged PNG product ${runId}`;

let eventAId: string;
let eventBId: string;
let productAId: string;
let productBId: string;
let orderAId: string;
let orderBId: string;
let poisonedCartId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [ownerA, ownerB] = await Promise.all([
    prisma.user.create({
      data: {
        email: ownerAEmail,
        name: "Store Owner A",
        passwordHash
      }
    }),
    prisma.user.create({
      data: {
        email: ownerBEmail,
        name: "Store Owner B",
        passwordHash
      }
    })
  ]);

  const [orgA, orgB] = await Promise.all([
    prisma.organization.create({
      data: {
        name: "Store Organization A",
        slug: orgASlug,
        subdomain: orgASlug,
        contactEmail: ownerAEmail,
        status: "ACTIVE",
        members: {
          create: {
            userId: ownerA.id,
            role: "OWNER"
          }
        },
        events: {
          create: {
            name: "Store Event A",
            slug: "store-event-a",
            startDate: new Date("2028-01-10T09:00:00Z"),
            endDate: new Date("2028-01-11T17:00:00Z"),
            status: "PUBLISHED",
            currency: "VND"
          }
        }
      },
      include: {
        events: true
      }
    }),
    prisma.organization.create({
      data: {
        name: "Store Organization B",
        slug: orgBSlug,
        subdomain: orgBSlug,
        contactEmail: ownerBEmail,
        status: "ACTIVE",
        members: {
          create: {
            userId: ownerB.id,
            role: "OWNER"
          }
        },
        events: {
          create: {
            name: "Store Event B",
            slug: "store-event-b",
            startDate: new Date("2028-02-10T09:00:00Z"),
            endDate: new Date("2028-02-11T17:00:00Z"),
            status: "PUBLISHED",
            currency: "USD"
          }
        }
      },
      include: {
        events: true
      }
    })
  ]);

  const ownerAAttendee = await createPortalAccountFixture(prisma, { orgId: orgA.id, email: ownerAEmail, name: "Store Owner A", password });
  const ownerBAttendee = await createPortalAccountFixture(prisma, { orgId: orgB.id, email: ownerBEmail, name: "Store Owner B", password });
  eventAId = orgA.events[0]!.id;
  eventBId = orgB.events[0]!.id;

  const [productA, productB] = await Promise.all([
    prisma.storeProduct.create({
      data: {
        orgId: orgA.id,
        eventId: eventAId,
        name: productAName,
        price: 125_000,
        stock: 20
      }
    }),
    prisma.storeProduct.create({
      data: {
        orgId: orgB.id,
        eventId: eventBId,
        name: productBName,
        price: 2_500,
        stock: 15
      }
    })
  ]);

  productAId = productA.id;
  productBId = productB.id;

  const [orderA, orderB] = await Promise.all([
    prisma.order.create({
      data: {
        orgId: orgA.id,
        eventId: eventAId,
        portalAccountId: ownerAAttendee.id,
        total: 0,
        platformFee: 0,
        currency: "VND",
        status: "PAID"
      }
    }),
    prisma.order.create({
      data: {
        orgId: orgB.id,
        eventId: eventBId,
        portalAccountId: ownerBAttendee.id,
        total: 0,
        platformFee: 0,
        currency: "USD",
        status: "PAID"
      }
    })
  ]);

  orderAId = orderA.id;
  orderBId = orderB.id;

  await prisma.cart.create({
    data: {
      orgId: orgA.id,
      eventId: eventAId,
      portalAccountId: ownerAAttendee.id,
      items: {
        create: {
          orgId: orgA.id,
          itemType: "PRODUCT",
          refId: productA.id,
          storeProductId: productA.id,
          unitPrice: productA.price,
          quantity: 1
        }
      }
    }
  });

  const poisonedCart = await prisma.cart.create({
    data: {
      orgId: orgA.id,
      eventId: eventBId,
      portalAccountId: ownerAAttendee.id,
      items: {
        create: {
          orgId: orgA.id,
          itemType: "PRODUCT",
          refId: productB.id,
          storeProductId: productB.id,
          unitPrice: productB.price,
          quantity: 1
        }
      }
    }
  });

  poisonedCartId = poisonedCart.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({
    where: {
      slug: {
        in: [orgASlug, orgBSlug]
      }
    }
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [ownerAEmail, ownerBEmail]
      }
    }
  });
  await prisma.$disconnect();
});

async function loginAsOwnerA(page: Page) {
  await loginWithCredentials(page, ownerAEmail, password);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible({ timeout: 30_000 });
}

async function navigateAfterRejectedAction(page: Page, pathname: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(pathname);
      return;
    } catch (error) {
      const isInterruptedNavigation =
        error instanceof Error &&
        (error.message.includes("ERR_ABORTED") || error.message.includes("interrupted by another navigation"));
      if (!isInterruptedNavigation || attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(500);
    }
  }
}

async function submitAction(page: Page, pathname: string, form: Locator, buttonName: string) {
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === new URL(pathname, "http://localhost:3000").pathname && response.request().method() === "POST"
  );
  await form.evaluate((formElement, name) => {
    const form = formElement as HTMLFormElement;
    const button = Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) => candidate.textContent?.trim() === name
    );
    if (!button) throw new Error("Expected mutation submit button was not found.");
    form.requestSubmit(button);
  }, buttonName);
  await responsePromise;
}

async function submitTamperedAction(
  page: Page,
  pathname: string,
  form: Locator,
  buttonName: string,
  fieldName: string,
  fieldValue: string
) {
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === new URL(pathname, "http://localhost:3000").pathname && response.request().method() === "POST"
  );
  await form.evaluate(
    (formElement, tamper) => {
      const form = formElement as HTMLFormElement;
      const control = form.querySelector<HTMLInputElement>(`input[name="${tamper.fieldName}"]`);
      const button = Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => candidate.textContent?.trim() === tamper.buttonName
      );
      if (!control || !button) throw new Error("Expected mutation form controls were not found.");
      control.value = tamper.fieldValue;
      form.requestSubmit(button);
    },
    { buttonName, fieldName, fieldValue }
  );
  await responsePromise;
}

async function expectOriginalProducts() {
  const [productA, productB] = await Promise.all([
    prisma.storeProduct.findUniqueOrThrow({ where: { id: productAId } }),
    prisma.storeProduct.findUniqueOrThrow({ where: { id: productBId } })
  ]);
  expect(productA.name).toBe(productAName);
  expect(productA.orgId).not.toBe(productB.orgId);
  expect(productA.archivedAt).toBeNull();
  expect(productB.name).toBe(productBName);
  expect(productB.archivedAt).toBeNull();
}

test("product catalog actions derive tenant and currency from the stored event or product", async ({ page }) => {
  await loginAsOwnerA(page);
  const storePath = `/dashboard/events/${eventAId}/store`;
  await page.goto(storePath);

  const createForm = page.getByRole("button", { name: "Create product" }).locator("xpath=ancestor::form");
  await expect(createForm.locator('input[name="orgId"]')).toHaveCount(0);
  await createForm.getByLabel("Name").fill(rejectedCreateName);
  await createForm.locator('input[name="price"]').fill("150000");
  await createForm.getByLabel("Stock").fill("3");
  await submitTamperedAction(page, storePath, createForm, "Create product", "eventId", eventBId);
  expect(await prisma.storeProduct.count({ where: { name: rejectedCreateName } })).toBe(0);

  await navigateAfterRejectedAction(page, storePath);
  const productSection = page
    .getByRole("heading", { name: productAName })
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' vf-section ')][1]");
  const updateForm = productSection.getByRole("button", { name: "Save product" }).locator("xpath=ancestor::form");
  await expect(updateForm.locator('input[name="orgId"], input[name="eventId"], input[name="existingImage"]')).toHaveCount(0);
  await expect(updateForm.locator('input[name="price"]')).toHaveValue("125000");
  await updateForm.getByLabel("Name").fill("Rejected product overwrite");
  await submitTamperedAction(page, storePath, updateForm, "Save product", "productId", productBId);
  await expectOriginalProducts();

  await navigateAfterRejectedAction(page, storePath);
  const archiveForm = page
    .getByRole("heading", { name: productAName })
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' vf-section ')][1]")
    .getByRole("button", { name: "Archive", exact: true })
    .locator("xpath=ancestor::form");
  await submitTamperedAction(page, storePath, archiveForm, "Archive", "productId", productBId);
  await expectOriginalProducts();

  await navigateAfterRejectedAction(page, storePath);
  const validCreateForm = page.getByRole("button", { name: "Create product" }).locator("xpath=ancestor::form");
  await validCreateForm.getByLabel("Name").fill(validCreateName);
  await validCreateForm.locator('input[name="price"]').fill("150000");
  await validCreateForm.getByLabel("Stock").fill("4");
  await submitAction(page, storePath, validCreateForm, "Create product");
  const created = await prisma.storeProduct.findFirstOrThrow({ where: { eventId: eventAId, name: validCreateName } });
  expect(created.orgId).toBe((await prisma.event.findUniqueOrThrow({ where: { id: eventAId } })).orgId);
  expect(created.price).toBe(150_000);

  await page.goto(storePath);
  const createdSection = page
    .getByRole("heading", { name: validCreateName })
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' vf-section ')][1]");
  const archiveCreatedForm = createdSection.getByRole("button", { name: "Archive", exact: true }).locator("xpath=ancestor::form");
  await submitAction(page, storePath, archiveCreatedForm, "Archive");

  await expect.poll(async () => (await prisma.storeProduct.findUniqueOrThrow({ where: { id: created.id } })).archivedAt).not.toBeNull();
  await page.goto(`${portalOrigin(orgASlug)}/store`);
  await expect(page.getByRole("heading", { name: validCreateName })).toHaveCount(0);
});

test("full and partial refunds reject an order from another tenant", async ({ page }) => {
  await loginAsOwnerA(page);
  const ordersPath = `/dashboard/events/${eventAId}/store/orders`;
  await page.goto(ordersPath);

  const orderSection = page
    .getByRole("heading", { name: "Store Owner A" })
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' vf-section ')][1]");
  const fullRefundForm = orderSection.getByRole("button", { name: "Full refund" }).locator("xpath=ancestor::form");
  await expect(fullRefundForm.locator('input[name="orgId"], input[name="eventId"]')).toHaveCount(0);
  await submitTamperedAction(page, ordersPath, fullRefundForm, "Full refund", "orderId", orderBId);

  await navigateAfterRejectedAction(page, ordersPath);
  const partialRefundForm = page
    .getByRole("heading", { name: "Store Owner A" })
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' vf-section ')][1]")
    .getByRole("button", { name: "Partial refund" })
    .locator("xpath=ancestor::form");
  await partialRefundForm.getByLabel("Partial refund amount").fill("1");
  await submitTamperedAction(page, ordersPath, partialRefundForm, "Partial refund", "orderId", orderBId);

  const [orderA, orderB] = await Promise.all([
    prisma.order.findUniqueOrThrow({ where: { id: orderAId } }),
    prisma.order.findUniqueOrThrow({ where: { id: orderBId } })
  ]);
  expect(orderA.status).toBe("PAID");
  expect(orderB.status).toBe("PAID");
});

test("checkout rejects a user-owned cart whose tenant does not match its event", async ({ page }) => {
  await loginAsOwnerA(page);
  await loginAsAttendee(page, { subdomain: orgASlug }, ownerAEmail, { password });
  const storePath = `${portalOrigin(orgASlug)}/store`;
  await page.goto(storePath);
  const checkoutForm = page.getByRole("button", { name: "Checkout" }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, storePath, checkoutForm, "Checkout", "cartId", poisonedCartId);
  expect(await prisma.order.count({ where: { cartId: poisonedCartId } })).toBe(0);
});

test("product upload action rejects unsupported and forged image files", async ({ page }) => {
  await loginAsOwnerA(page);
  const storePath = `/dashboard/events/${eventAId}/store`;

  await page.goto(storePath);
  let createForm = page.getByRole("button", { name: "Create product" }).locator("xpath=ancestor::form");
  await createForm.getByLabel("Name").fill(invalidTypeName);
  await createForm.locator('input[name="price"]').fill("100000");
  await createForm.getByLabel("Stock").fill("1");
  await createForm.getByLabel("Upload image").setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>")
  });
  await submitAction(page, storePath, createForm, "Create product");
  await expect(page.getByTestId("create-product-error")).toContainText(
    "Product images must be PNG, JPEG, or WebP files."
  );
  await expect(createForm.getByLabel("Name")).toHaveValue(invalidTypeName);
  await expect(createForm.getByRole("button", { name: "Create product" })).toBeEnabled();
  await expect(page.getByTestId("route-error")).toHaveCount(0);
  expect(await prisma.storeProduct.count({ where: { name: invalidTypeName } })).toBe(0);

  await navigateAfterRejectedAction(page, storePath);
  createForm = page.getByRole("button", { name: "Create product" }).locator("xpath=ancestor::form");
  await createForm.getByLabel("Name").fill(invalidContentsName);
  await createForm.locator('input[name="price"]').fill("100000");
  await createForm.getByLabel("Stock").fill("1");
  await createForm.getByLabel("Upload image").setInputFiles({
    name: "forged.png",
    mimeType: "image/png",
    buffer: Buffer.from("this is not a png")
  });
  await submitAction(page, storePath, createForm, "Create product");
  await expect(page.getByTestId("create-product-error")).toContainText(
    "Product image contents do not match the declared file type."
  );
  await expect(createForm.getByLabel("Name")).toHaveValue(invalidContentsName);
  await expect(page.getByTestId("route-error")).toHaveCount(0);
  expect(await prisma.storeProduct.count({ where: { name: invalidContentsName } })).toBe(0);
});
