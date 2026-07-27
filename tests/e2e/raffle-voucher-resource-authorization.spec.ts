import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "RaffleVoucherPass123!";
const ownerAEmail = `raffle-owner-a-${runId}@example.com`;
const ownerBEmail = `raffle-owner-b-${runId}@example.com`;
const buyerEmail = `raffle-buyer-${runId}@example.com`;
const attendeeAEmail = `raffle-attendee-a-${runId}@example.com`;
const attendeeBEmail = `raffle-attendee-b-${runId}@example.com`;
const rejectedEntryEmail = `raffle-rejected-entry-${runId}@example.com`;
const poisonedRegistrationEmail = `voucher-poisoned-registration-${runId}@example.com`;
const orgASlug = `raffle-org-a-${runId}`;
const orgBSlug = `raffle-org-b-${runId}`;
const raffleAName = `Raffle A ${runId}`;
const raffleBName = `Raffle B ${runId}`;
const rejectedRaffleName = `Rejected raffle ${runId}`;
const validRaffleName = `Valid raffle ${runId}`;
const rejectedVoucherCode = `REJECT-${process.pid}`;
const restrictedVoucherCode = `WRONGTIER-${process.pid}`;
const validVoucherCode = `VND-${process.pid}`;

let orgAId: string;
let orgBId: string;
let eventAId: string;
let eventBId: string;
let tierAId: string;
let tierBId: string;
let raffleAId: string;
let raffleBId: string;
let attendeeAId: string;
let cartAId: string;
let cartBId: string;
let voucherAId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [ownerA, ownerB, buyer, attendeeA, attendeeB] = await Promise.all([
    prisma.user.create({ data: { email: ownerAEmail, name: "Raffle Owner A", passwordHash } }),
    prisma.user.create({ data: { email: ownerBEmail, name: "Raffle Owner B", passwordHash } }),
    prisma.user.create({ data: { email: buyerEmail, name: "Raffle Buyer", passwordHash } }),
    prisma.user.create({ data: { email: attendeeAEmail, name: "Raffle Attendee A" } }),
    prisma.user.create({ data: { email: attendeeBEmail, name: "Raffle Attendee B" } })
  ]);
  attendeeAId = attendeeA.id;

  const [orgA, orgB] = await Promise.all([
    prisma.organization.create({
      data: {
        name: "Raffle Organization A",
        slug: orgASlug,
        subdomain: orgASlug,
        contactEmail: ownerAEmail,
        status: "ACTIVE",
        members: { create: { userId: ownerA.id, role: "OWNER" } },
        events: {
          create: {
            name: "Raffle Event A",
            slug: "raffle-event-a",
            currency: "VND",
            status: "PUBLISHED",
            startDate: new Date("2028-05-01T09:00:00Z"),
            endDate: new Date("2028-05-02T17:00:00Z")
          }
        }
      },
      include: { events: true }
    }),
    prisma.organization.create({
      data: {
        name: "Raffle Organization B",
        slug: orgBSlug,
        subdomain: orgBSlug,
        contactEmail: ownerBEmail,
        status: "ACTIVE",
        members: { create: { userId: ownerB.id, role: "OWNER" } },
        events: {
          create: {
            name: "Raffle Event B",
            slug: "raffle-event-b",
            status: "PUBLISHED",
            startDate: new Date("2028-06-01T09:00:00Z"),
            endDate: new Date("2028-06-02T17:00:00Z")
          }
        }
      },
      include: { events: true }
    })
  ]);
  orgAId = orgA.id;
  orgBId = orgB.id;
  eventAId = orgA.events[0]!.id;
  eventBId = orgB.events[0]!.id;

  const [tierA, tierB] = await Promise.all([
    prisma.registrationType.create({
      data: { orgId: orgAId, eventId: eventAId, name: "Free Raffle Tier A", price: 0 }
    }),
    prisma.registrationType.create({
      data: { orgId: orgBId, eventId: eventBId, name: "Raffle Tier B", price: 5000 }
    })
  ]);
  tierAId = tierA.id;
  tierBId = tierB.id;

  const [raffleA, raffleB] = await Promise.all([
    prisma.raffle.create({
      data: {
        orgId: orgAId,
        eventId: eventAId,
        name: raffleAName,
        prizes: [{ name: "VIP A", description: "A prize", quantity: 1 }],
        drawDate: new Date("2028-05-02T12:00:00Z")
      }
    }),
    prisma.raffle.create({
      data: {
        orgId: orgBId,
        eventId: eventBId,
        name: raffleBName,
        prizes: [{ name: "VIP B", description: "B prize", quantity: 1 }],
        drawDate: new Date("2028-06-02T12:00:00Z")
      }
    })
  ]);
  raffleAId = raffleA.id;
  raffleBId = raffleB.id;

  const [registrationA] = await Promise.all([
    prisma.registration.create({
      data: { orgId: orgAId, eventId: eventAId, userId: attendeeA.id, typeId: tierA.id, status: "CONFIRMED" }
    }),
    prisma.registration.create({
      data: { orgId: orgBId, eventId: eventBId, userId: attendeeB.id, typeId: tierB.id, status: "CONFIRMED" }
    })
  ]);

  await Promise.all([
    prisma.raffleEntry.create({
      data: { orgId: orgAId, raffleId: raffleA.id, userId: registrationA.userId, entryMethod: "AUTO" }
    }),
    prisma.raffleEntry.create({
      data: { orgId: orgBId, raffleId: raffleB.id, userId: attendeeB.id, entryMethod: "AUTO" }
    })
  ]);

  const [voucherA] = await Promise.all([
    prisma.voucher.create({
      data: {
        orgId: orgAId,
        eventId: eventAId,
        code: "STOREA",
        discountType: "AMOUNT",
        discountValue: 10_000,
        restrictions: { tierIds: [], compedRegistration: false }
      }
    }),
    prisma.voucher.create({
      data: {
        orgId: orgBId,
        eventId: eventBId,
        code: "STOREB",
        discountType: "PERCENT",
        discountValue: 10,
        restrictions: { tierIds: [], compedRegistration: false }
      }
    }),
    prisma.voucher.create({
      data: {
        orgId: orgBId,
        eventId: eventAId,
        code: "POISON",
        discountType: "PERCENT",
        discountValue: 10,
        restrictions: { tierIds: [], compedRegistration: false }
      }
    })
  ]);
  voucherAId = voucherA.id;

  const [cartA, cartB] = await Promise.all([
    prisma.cart.create({ data: { orgId: orgAId, eventId: eventAId, userId: buyer.id } }),
    prisma.cart.create({ data: { orgId: orgBId, eventId: eventBId, userId: buyer.id } })
  ]);
  cartAId = cartA.id;
  cartBId = cartB.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [orgASlug, orgBSlug] } } });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          ownerAEmail,
          ownerBEmail,
          buyerEmail,
          attendeeAEmail,
          attendeeBEmail,
          rejectedEntryEmail,
          poisonedRegistrationEmail
        ]
      }
    }
  });
  await prisma.$disconnect();
});

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/login") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Log in" }).click({ noWaitAfter: true })
  ]);
}

async function loginAsOwnerA(page: Page) {
  await login(page, ownerAEmail);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible({ timeout: 30_000 });
}

async function navigateAfterRejectedAction(page: Page, pathname: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(pathname);
      return;
    } catch (error) {
      const interrupted =
        error instanceof Error &&
        (error.message.includes("ERR_ABORTED") || error.message.includes("interrupted by another navigation"));
      if (!interrupted || attempt === 2) throw error;
      await page.waitForTimeout(500);
    }
  }
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
    (response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"
  );
  await form.evaluate(
    (formElement, tamper) => {
      const htmlForm = formElement as HTMLFormElement;
      let control = htmlForm.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${tamper.fieldName}"]`);
      const button = Array.from(htmlForm.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => candidate.textContent?.trim() === tamper.buttonName
      );
      if (!control) {
        control = document.createElement("input");
        control.type = "hidden";
        control.name = tamper.fieldName;
        htmlForm.append(control);
      }
      if (!button) throw new Error("Expected mutation button was not found.");
      if (control instanceof HTMLSelectElement && !Array.from(control.options).some((option) => option.value === tamper.fieldValue)) {
        control.add(new Option("Tampered foreign resource", tamper.fieldValue));
      }
      control.value = tamper.fieldValue;
      if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
        control.checked = true;
      }
      htmlForm.requestSubmit(button);
    },
    { buttonName, fieldName, fieldValue }
  );
  await responsePromise;
}

test("raffle creation derives tenant from the stored event", async ({ page }) => {
  await loginAsOwnerA(page);
  const pathname = `/dashboard/events/${eventAId}/raffle`;
  await page.goto(pathname);
  let form = page.getByRole("button", { name: "Create raffle" }).locator("xpath=ancestor::form");
  await form.getByLabel("Name").fill(rejectedRaffleName);
  await form.getByLabel("Draw date").fill("2028-05-02T14:00");
  await form.getByLabel("Prizes").fill("Rejected prize|1|Should not be created");
  await submitTamperedAction(page, pathname, form, "Create raffle", "eventId", eventBId);
  expect(await prisma.raffle.count({ where: { name: rejectedRaffleName } })).toBe(0);

  await navigateAfterRejectedAction(page, pathname);
  form = page.getByRole("button", { name: "Create raffle" }).locator("xpath=ancestor::form");
  await form.getByLabel("Name").fill(validRaffleName);
  await form.getByLabel("Draw date").fill("2028-05-02T15:00");
  await form.getByLabel("Prizes").fill("Local prize|2|Stored under event A");
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"),
    form.getByRole("button", { name: "Create raffle" }).click()
  ]);
  const created = await prisma.raffle.findFirstOrThrow({ where: { name: validRaffleName } });
  expect(created.orgId).toBe(orgAId);
  expect(created.eventId).toBe(eventAId);
});

test("manual, automatic, and draw raffle mutations reject a foreign raffle ID", async ({ page }) => {
  await loginAsOwnerA(page);
  const pathname = `/dashboard/events/${eventAId}/raffle`;
  await page.goto(pathname);
  let article = page.locator("article", { hasText: raffleAName });
  let form = article.getByRole("button", { name: "Add entry" }).locator("xpath=ancestor::form");
  await form.getByLabel("Manual entry email").fill(rejectedEntryEmail);
  await form.getByLabel("Name", { exact: true }).fill("Rejected entrant");
  await submitTamperedAction(page, pathname, form, "Add entry", "raffleId", raffleBId);
  expect(await prisma.user.count({ where: { email: rejectedEntryEmail } })).toBe(0);

  const foreignEntryCount = await prisma.raffleEntry.count({ where: { raffleId: raffleBId } });
  await navigateAfterRejectedAction(page, pathname);
  article = page.locator("article", { hasText: raffleAName });
  form = article.getByRole("button", { name: "Auto-enter attendees" }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, pathname, form, "Auto-enter attendees", "raffleId", raffleBId);
  expect(await prisma.raffleEntry.count({ where: { raffleId: raffleBId } })).toBe(foreignEntryCount);
  expect(await prisma.raffleEntry.count({ where: { raffleId: raffleBId, userId: attendeeAId } })).toBe(0);

  await navigateAfterRejectedAction(page, pathname);
  article = page.locator("article", { hasText: raffleAName });
  form = article.getByRole("button", { name: "Draw winner" }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, pathname, form, "Draw winner", "raffleId", raffleBId);
  const [eventA, eventB] = await Promise.all([
    prisma.event.findUniqueOrThrow({ where: { id: eventAId } }),
    prisma.event.findUniqueOrThrow({ where: { id: eventBId } })
  ]);
  expect((eventA.settings as { raffleHistory?: unknown }).raffleHistory).toBeUndefined();
  expect((eventB.settings as { raffleHistory?: unknown }).raffleHistory).toBeUndefined();

  await navigateAfterRejectedAction(page, pathname);
  article = page.locator("article", { hasText: raffleAName });
  form = article.getByRole("button", { name: "Draw winner" }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, pathname, form, "Draw winner", "prizeName", "Not a stored prize");
  expect(
    ((await prisma.event.findUniqueOrThrow({ where: { id: eventAId } })).settings as { raffleHistory?: unknown })
      .raffleHistory
  ).toBeUndefined();
});

test("voucher creation and bulk generation reject foreign event and tier resources", async ({ page }) => {
  await loginAsOwnerA(page);
  const pathname = `/dashboard/events/${eventAId}/vouchers`;
  await page.goto(pathname);
  let form = page.getByRole("button", { name: "Create voucher" }).locator("xpath=ancestor::form");
  await form.getByLabel("Code").fill(rejectedVoucherCode);
  await submitTamperedAction(page, pathname, form, "Create voucher", "eventId", eventBId);
  expect(await prisma.voucher.count({ where: { code: rejectedVoucherCode } })).toBe(0);

  await navigateAfterRejectedAction(page, pathname);
  form = page.getByRole("button", { name: "Create voucher" }).locator("xpath=ancestor::form");
  await form.getByLabel("Code").fill(restrictedVoucherCode);
  await submitTamperedAction(page, pathname, form, "Create voucher", "tierId", tierBId);
  expect(await prisma.voucher.count({ where: { code: restrictedVoucherCode } })).toBe(0);

  await navigateAfterRejectedAction(page, pathname);
  form = page.getByRole("button", { name: "Generate codes" }).locator("xpath=ancestor::form");
  await form.getByLabel("Prefix").fill("FOREIGN");
  await form.getByLabel("Quantity").fill("2");
  await submitTamperedAction(page, pathname, form, "Generate codes", "eventId", eventBId);
  expect(await prisma.voucher.count({ where: { code: { startsWith: "FOREIGN-" } } })).toBe(0);

  await navigateAfterRejectedAction(page, pathname);
  form = page.getByRole("button", { name: "Create voucher" }).locator("xpath=ancestor::form");
  await form.getByLabel("Code").fill(validVoucherCode);
  await form.getByLabel("Discount type").selectOption("AMOUNT");
  await form.getByLabel("Discount value").fill("50000");
  await form.locator(`input[name="tierId"][value="${tierAId}"]`).check();
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"),
    form.getByRole("button", { name: "Create voucher" }).click()
  ]);
  const validVoucher = await prisma.voucher.findUniqueOrThrow({
    where: { eventId_code: { eventId: eventAId, code: validVoucherCode } }
  });
  expect(validVoucher.orgId).toBe(orgAId);
  expect(validVoucher.discountValue).toBe(50_000);
  expect((validVoucher.restrictions as { tierIds?: string[] }).tierIds).toEqual([tierAId]);

  await page.reload();
  form = page.getByRole("button", { name: "Create voucher" }).locator("xpath=ancestor::form");
  await form.getByLabel("Code").fill(validVoucherCode);
  await form.getByRole("button", { name: "Create voucher" }).click();
  await expect(page.getByTestId("create-voucher-error")).toContainText(
    "A voucher with this code already exists for the event."
  );
  await expect(form.getByLabel("Code")).toHaveValue(validVoucherCode);
  await expect(form.getByRole("button", { name: "Create voucher" })).toBeEnabled();
  await expect(page.getByTestId("route-error")).toHaveCount(0);
  expect(await prisma.voucher.count({ where: { eventId: eventAId, code: validVoucherCode } })).toBe(1);
});

test("public voucher application derives event from the user-owned cart", async ({ page }) => {
  await login(page, buyerEmail);
  const pathname = `/${orgASlug}/store`;
  await page.goto(pathname);
  let form = page.getByRole("button", { name: "Apply" }).locator("xpath=ancestor::form");
  await form.getByLabel("Discount code").fill("STOREA");
  await submitTamperedAction(page, pathname, form, "Apply", "cartId", cartBId);
  const [cartA, cartB] = await Promise.all([
    prisma.cart.findUniqueOrThrow({ where: { id: cartAId } }),
    prisma.cart.findUniqueOrThrow({ where: { id: cartBId } })
  ]);
  expect(cartA.voucherId).toBeNull();
  expect(cartB.voucherId).toBeNull();

  await navigateAfterRejectedAction(page, pathname);
  form = page.getByRole("button", { name: "Apply" }).locator("xpath=ancestor::form");
  await form.getByLabel("Discount code").fill("STOREA");
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"),
    form.getByRole("button", { name: "Apply" }).click()
  ]);
  expect((await prisma.cart.findUniqueOrThrow({ where: { id: cartAId } })).voucherId).toBe(voucherAId);
});

test("public registration rejects an internally cross-tenant voucher before creating identity or order data", async ({ page }) => {
  await login(page, buyerEmail);
  const pathname = `/${orgASlug}/register`;
  await page.goto(pathname);
  await expect(page.locator('[data-registration-ready="true"]')).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill("Poisoned Voucher Attendee");
  await expect(page.getByLabel("Email")).toHaveValue(buyerEmail);
  await page.getByLabel("Voucher code").fill("POISON");
  await page.getByRole("button", { name: "Review" }).click();
  const form = page.getByRole("button", { name: "Complete registration" }).locator("xpath=ancestor::form");
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"),
    form.getByRole("button", { name: "Complete registration" }).click()
  ]);

  expect(await prisma.user.count({ where: { email: poisonedRegistrationEmail } })).toBe(0);
  expect(await prisma.registration.count({ where: { eventId: eventAId, user: { email: poisonedRegistrationEmail } } })).toBe(0);
  expect(await prisma.order.count({ where: { eventId: eventAId, user: { email: poisonedRegistrationEmail } } })).toBe(0);
});
