import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "HotelResourcePass123!";
const ownerAEmail = `hotel-owner-a-${runId}@example.com`;
const ownerBEmail = `hotel-owner-b-${runId}@example.com`;
const guestAEmail = `hotel-guest-a-${runId}@example.com`;
const guestBEmail = `hotel-guest-b-${runId}@example.com`;
const validGuestEmail = `hotel-valid-guest-${runId}@example.com`;
const tamperedGuestEmail = `hotel-tampered-guest-${runId}@example.com`;
const orgASlug = `hotel-org-a-${runId}`;
const orgBSlug = `hotel-org-b-${runId}`;
const eventAName = `Hotel Event A ${runId}`;
const eventBName = `Hotel Event B ${runId}`;
const blockAName = `Hotel Block A ${runId}`;
const blockBName = `Hotel Block B ${runId}`;
const rejectedBlockName = `Rejected Foreign Block ${runId}`;
const validBlockName = `Valid Hotel Block ${runId}`;

let eventAId: string;
let eventBId: string;
let blockAId: string;
let blockBId: string;
let bookingAId: string;
let bookingBId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [ownerA, ownerB] = await Promise.all([
    prisma.user.create({
      data: {
        email: ownerAEmail,
        name: "Hotel Owner A",
        passwordHash
      }
    }),
    prisma.user.create({
      data: {
        email: ownerBEmail,
        name: "Hotel Owner B",
        passwordHash
      }
    })
  ]);

  const [orgA, orgB] = await Promise.all([
    prisma.organization.create({
      data: {
        name: "Hotel Organization A",
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
            name: eventAName,
            slug: "hotel-event-a",
            startDate: new Date("2028-04-10T09:00:00Z"),
            endDate: new Date("2028-04-11T17:00:00Z"),
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
        name: "Hotel Organization B",
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
            name: eventBName,
            slug: "hotel-event-b",
            startDate: new Date("2028-05-10T09:00:00Z"),
            endDate: new Date("2028-05-11T17:00:00Z"),
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

  eventAId = orgA.events[0]!.id;
  eventBId = orgB.events[0]!.id;
  const cutoffDate = new Date(Date.now() + 30 * 86_400_000);

  const [blockA, blockB] = await Promise.all([
    prisma.hotelBlock.create({
      data: {
        orgId: orgA.id,
        eventId: eventAId,
        hotelName: blockAName,
        cutoffDate,
        roomTypes: [{ name: "Double", rate: 0, totalRooms: 5, bookedRooms: 1 }]
      }
    }),
    prisma.hotelBlock.create({
      data: {
        orgId: orgB.id,
        eventId: eventBId,
        hotelName: blockBName,
        cutoffDate,
        roomTypes: [{ name: "Double", rate: 1000, totalRooms: 5, bookedRooms: 1 }]
      }
    })
  ]);

  blockAId = blockA.id;
  blockBId = blockB.id;

  const [guestA, guestB] = await Promise.all([
    prisma.user.create({ data: { email: guestAEmail, name: "Hotel Guest A" } }),
    prisma.user.create({ data: { email: guestBEmail, name: "Hotel Guest B" } })
  ]);

  const [bookingA, bookingB] = await Promise.all([
    prisma.hotelBooking.create({
      data: {
        orgId: orgA.id,
        userId: guestA.id,
        blockId: blockA.id,
        roomType: "Double",
        checkIn: new Date("2028-04-10T00:00:00Z"),
        checkOut: new Date("2028-04-11T00:00:00Z"),
        confirmationCode: "VF-A"
      }
    }),
    prisma.hotelBooking.create({
      data: {
        orgId: orgB.id,
        userId: guestB.id,
        blockId: blockB.id,
        roomType: "Double",
        checkIn: new Date("2028-05-10T00:00:00Z"),
        checkOut: new Date("2028-05-11T00:00:00Z"),
        confirmationCode: "VF-B"
      }
    })
  ]);

  bookingAId = bookingA.id;
  bookingBId = bookingB.id;
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
        in: [ownerAEmail, ownerBEmail, guestAEmail, guestBEmail, validGuestEmail, tamperedGuestEmail]
      }
    }
  });
  await prisma.$disconnect();
});

async function loginAsOwnerA(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerAEmail);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/login") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Log in" }).click({ noWaitAfter: true })
  ]);
  await page.goto("/dashboard");
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
    (response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"
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
    (response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"
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

function hotelSection(page: Page, name: string) {
  return page
    .getByRole("heading", { name })
    .last()
    .locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' vf-section ')][1]");
}

async function expectOriginalHotelResources() {
  const [blockA, blockB, bookingA, bookingB] = await Promise.all([
    prisma.hotelBlock.findUniqueOrThrow({ where: { id: blockAId } }),
    prisma.hotelBlock.findUniqueOrThrow({ where: { id: blockBId } }),
    prisma.hotelBooking.findUniqueOrThrow({ where: { id: bookingAId } }),
    prisma.hotelBooking.findUniqueOrThrow({ where: { id: bookingBId } })
  ]);
  expect(blockA.hotelName).toBe(blockAName);
  expect(blockB.hotelName).toBe(blockBName);
  expect(bookingA.blockId).toBe(blockAId);
  expect(bookingB.blockId).toBe(blockBId);
  expect(bookingB.confirmationCode).toBe("VF-B");
}

test("public hotel success lookup is tenant-scoped and booking binds block to event", async ({ page }) => {
  await page.goto(`/${orgASlug}/hotel?success=${bookingBId}`);
  await expect(page.getByRole("heading", { name: "Hotel booking confirmed" })).toHaveCount(0);
  await expect(page.getByText("Hotel Guest B")).toHaveCount(0);

  await page.goto(`/${orgASlug}/hotel?success=${bookingAId}`);
  await expect(page.getByRole("heading", { name: "Hotel booking confirmed" })).toBeVisible();
  await expect(page.getByText("Hotel Guest A")).toBeVisible();

  await page.goto(`/${orgASlug}/hotel`);
  const publicForm = page.getByRole("heading", { name: blockAName }).locator("xpath=ancestor::form");
  await publicForm.getByLabel("Check-in").fill("2028-04-10");
  await publicForm.getByLabel("Check-out").fill("2028-04-11");
  await publicForm.getByLabel("Guest name").fill("Rejected Guest");
  await publicForm.getByLabel("Guest email").fill(tamperedGuestEmail);
  await submitTamperedAction(page, `/${orgASlug}/hotel`, publicForm, "Continue to checkout", "blockId", blockBId);
  expect(await prisma.hotelBooking.count({ where: { user: { email: tamperedGuestEmail } } })).toBe(0);
});

test("hotel block and booking mutations derive access from stored resources", async ({ page }) => {
  await loginAsOwnerA(page);
  const hotelPath = `/dashboard/events/${eventAId}/hotel`;
  await page.goto(hotelPath);

  const createForm = page.getByRole("button", { name: "Create block" }).locator("xpath=ancestor::form");
  await expect(createForm.locator('input[name="orgId"]')).toHaveCount(0);
  await createForm.getByLabel("Hotel name").fill(rejectedBlockName);
  await createForm.locator('input[name="cutoffDate"]').fill("2028-06-01");
  await createForm.locator('input[name="roomName"]').first().fill("Double");
  await createForm.locator('input[name="roomRate"]').first().fill("100000");
  await createForm.locator('input[name="roomTotal"]').first().fill("2");
  await submitTamperedAction(page, hotelPath, createForm, "Create block", "eventId", eventBId);
  expect(await prisma.hotelBlock.count({ where: { hotelName: rejectedBlockName } })).toBe(0);

  await navigateAfterRejectedAction(page, hotelPath);
  const blockSection = hotelSection(page, blockAName);
  const updateForm = blockSection.getByRole("button", { name: "Save block" }).locator("xpath=ancestor::form");
  await expect(updateForm.locator('input[name="orgId"], input[name="eventId"]')).toHaveCount(0);
  await updateForm.getByLabel("Hotel name").fill("Rejected block overwrite");
  await submitTamperedAction(page, hotelPath, updateForm, "Save block", "blockId", blockBId);
  await expectOriginalHotelResources();

  await navigateAfterRejectedAction(page, hotelPath);
  const bookingRow = page.getByText("Hotel Guest A").locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' vf-list-row ')][1]");
  const cancelForm = bookingRow.getByRole("button", { name: "Cancel" }).locator("xpath=ancestor::form");
  await expect(cancelForm.locator('input[name="orgId"], input[name="eventId"]')).toHaveCount(0);
  await submitTamperedAction(page, hotelPath, cancelForm, "Cancel", "bookingId", bookingBId);
  await expectOriginalHotelResources();

  await navigateAfterRejectedAction(page, hotelPath);
  const validCreateForm = page.getByRole("button", { name: "Create block" }).locator("xpath=ancestor::form");
  await validCreateForm.getByLabel("Hotel name").fill(validBlockName);
  await validCreateForm.locator('input[name="cutoffDate"]').fill("2028-06-01");
  await validCreateForm.locator('input[name="roomName"]').first().fill("Suite");
  await validCreateForm.locator('input[name="roomRate"]').first().fill("125000");
  await validCreateForm.locator('input[name="roomTotal"]').first().fill("2");
  await submitAction(page, hotelPath, validCreateForm, "Create block");
  const created = await prisma.hotelBlock.findFirstOrThrow({ where: { eventId: eventAId, hotelName: validBlockName } });
  expect(created.orgId).toBe((await prisma.event.findUniqueOrThrow({ where: { id: eventAId } })).orgId);
});

test("public VND hotel booking creates an event-scoped order", async ({ page }) => {
  await page.goto(`/${orgASlug}/hotel`);
  const publicForm = page.getByRole("heading", { name: blockAName }).locator("xpath=ancestor::form");
  await publicForm.getByLabel("Check-in").fill("2028-04-10");
  await publicForm.getByLabel("Check-out").fill("2028-04-11");
  await publicForm.getByLabel("Guest name").fill("Valid Hotel Guest");
  await publicForm.getByLabel("Guest email").fill(validGuestEmail);
  await submitAction(page, `/${orgASlug}/hotel`, publicForm, "Continue to checkout");

  const booking = await prisma.hotelBooking.findFirstOrThrow({ where: { user: { email: validGuestEmail } } });
  const orderItem = await prisma.orderItem.findFirstOrThrow({ where: { refId: booking.id, itemType: "HOTEL" }, include: { order: true } });
  expect(booking.orgId).toBe((await prisma.event.findUniqueOrThrow({ where: { id: eventAId } })).orgId);
  expect(orderItem.order.eventId).toBe(eventAId);
  expect(orderItem.order.currency).toBe("VND");
  expect(orderItem.order.total).toBe(0);
});
