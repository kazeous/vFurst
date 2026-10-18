import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const ownerEmail = `event-fields-owner-${runId}@example.com`;
const orgSlug = `event-fields-${runId}`;
const eventSlug = `event-fields-${runId}`;
const tierName = `Scheduled Tier ${runId}`;

let orgId: string;
let eventId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);
// A native date input follows the browser locale, which showed mm/dd/yyyy under en-US.
test.use({ locale: "en-US", timezoneId: "America/Los_Angeles", serviceWorkers: "block" });

test.beforeAll(async () => {
  const owner = await prisma.user.create({
    data: {
      email: ownerEmail,
      name: "Event Fields Owner",
      ...staffIdentityData()
    }
  });
  const org = await prisma.organization.create({
    data: {
      name: "Event Fields Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: ownerEmail,
      status: "ACTIVE",
      members: {
        create: {
          userId: owner.id,
          role: "OWNER"
        }
      }
    }
  });
  orgId = org.id;
  const event = await prisma.event.create({
    data: {
      orgId,
      name: `Event Fields ${runId}`,
      slug: eventSlug,
      startDate: new Date("2027-08-01T00:00:00Z"),
      endDate: new Date("2027-08-03T00:00:00Z")
    }
  });
  eventId = event.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: orgSlug } });
  await prisma.user.deleteMany({ where: { email: ownerEmail } });
  await prisma.$disconnect();
});

async function login(page: Page) {
  await loginAsStaffEmail(page, ownerEmail);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible({ timeout: 30_000 });
}

function formWithButton(page: Page, buttonName: string) {
  return page.getByRole("button", { name: buttonName }).locator("xpath=ancestor::form");
}

async function storedEventDates(slug: string) {
  const event = await prisma.event.findUnique({ where: { orgId_slug: { orgId, slug } } });
  return event ? [event.startDate.toISOString(), event.endDate.toISOString()] : null;
}

test("the Create event card fills the slug from the name until the organizer edits it", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/organizations/${orgId}`);
  const form = formWithButton(page, "Create event");
  const name = form.getByLabel("Name", { exact: true });
  const slug = form.getByLabel("Slug", { exact: true });

  await name.fill("vFurstCon 2027");
  await expect(slug).toHaveValue("vfurstcon-2027");
  await name.fill("Hội Chợ Đà Nẵng 2027");
  await expect(slug).toHaveValue("hoi-cho-da-nang-2027");

  await slug.fill("autumn-fair");
  await name.fill("Autumn Fair 2027");
  await expect(slug).toHaveValue("autumn-fair");

  await slug.fill("");
  await name.fill("vFurstCon 2027");
  await expect(slug).toHaveValue("vfurstcon-2027");
});

test("the Create event card saves dd/mm/yyyy dates as the typed calendar days", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/organizations/${orgId}`);
  const form = formWithButton(page, "Create event");
  await expect(form.getByLabel("Start date")).toHaveAttribute("placeholder", "dd/mm/yyyy");

  await form.getByLabel("Name", { exact: true }).fill("Day First Con 2028");
  await form.getByLabel("Start date").fill("04/03/2028");
  await form.getByLabel("End date").fill("06/03/2028");
  await form.getByRole("button", { name: "Create event" }).click();

  await expect.poll(() => storedEventDates("day-first-con-2028"), { timeout: 30_000 }).toEqual([
    "2028-03-04T00:00:00.000Z",
    "2028-03-06T00:00:00.000Z"
  ]);
});

test("the server still validates a hand-edited slug", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/organizations/${orgId}`);
  const form = formWithButton(page, "Create event");

  await form.getByLabel("Name", { exact: true }).fill("Server Authority Con");
  await form.getByLabel("Slug", { exact: true }).fill("Bad Slug!");
  await form.getByLabel("Start date").fill("04/03/2028");
  await form.getByLabel("End date").fill("06/03/2028");
  await form.getByRole("button", { name: "Create event" }).click();

  await expect(page.getByTestId("create-event-error")).toBeVisible();
  await expect(form.getByLabel("Start date")).toHaveValue("04/03/2028");
  expect(await prisma.event.count({ where: { orgId, name: "Server Authority Con" } })).toBe(0);
});

test("the event wizard fills the slug from the event name and saves dd/mm/yyyy dates", async ({ page }) => {
  await login(page);
  await page.goto("/dashboard/events/new");
  const wizard = formWithButton(page, "Create event");
  const name = wizard.getByLabel("Event name");
  const slug = wizard.getByLabel("Slug", { exact: true });

  await wizard.locator('select[name="orgId"]').selectOption(orgId);
  await name.fill("vFurstCon 2027");
  await expect(slug).toHaveValue("vfurstcon-2027");
  await slug.fill("wizard-con");
  await name.fill("Wizard Con 2028");
  await expect(slug).toHaveValue("wizard-con");

  await wizard.getByLabel("Start date").fill("04/03/2028");
  await wizard.getByLabel("End date").fill("06/03/2028");
  await wizard.locator('input[name="tierName"]').first().fill("General");
  await wizard.locator('input[name="tierPrice"]').first().fill("0");
  await wizard.getByRole("button", { name: "Create event" }).click();

  await expect.poll(() => storedEventDates("wizard-con"), { timeout: 30_000 }).toEqual([
    "2028-03-04T00:00:00.000Z",
    "2028-03-06T00:00:00.000Z"
  ]);
});

test("event settings show stored dates as dd/mm/yyyy and reject impossible ones", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/events/${eventId}/settings`);
  const start = page.getByLabel("Start date");
  const end = page.getByLabel("End date");
  await expect(start).toHaveValue("01/08/2027");
  await expect(end).toHaveValue("03/08/2027");

  await end.fill("31/02/2027");
  await expect(end).toHaveJSProperty("validationMessage", "Enter the date as dd/mm/yyyy.");
  expect(await end.evaluate((input: HTMLInputElement) => input.form?.checkValidity())).toBe(false);

  await end.fill("5/8/2027");
  await end.blur();
  await expect(end).toHaveValue("05/08/2027");
  await expect(end).toHaveJSProperty("validationMessage", "");
  await page.getByRole("button", { name: "Save event settings" }).click();

  await expect.poll(() => storedEventDates(eventSlug), { timeout: 30_000 }).toEqual([
    "2027-08-01T00:00:00.000Z",
    "2027-08-05T00:00:00.000Z"
  ]);
});

test("a plain action form clears its date fields with its other fields after saving", async ({ page }) => {
  await login(page);
  await page.goto(`/dashboard/events/${eventId}/registrations/types`);
  const form = formWithButton(page, "Create tier");

  await form.getByLabel("Name", { exact: true }).fill(tierName);
  await form.getByLabel("Price", { exact: true }).fill("40");
  await form.getByLabel("Price start").fill("01/09/2027");
  await form.getByLabel("Price end").fill("30/09/2027");
  await form.getByLabel("Scheduled price").fill("30");
  await form.getByRole("button", { name: "Create tier" }).click();

  await expect.poll(
    async () => (await prisma.registrationType.findFirst({ where: { eventId, name: tierName } }))?.scheduledPricing ?? null,
    { timeout: 30_000 }
  ).toEqual([{ startDate: "2027-09-01", endDate: "2027-09-30", price: 3000 }]);
  await expect(form.getByLabel("Name", { exact: true })).toHaveValue("");
  await expect(form.getByLabel("Price start")).toHaveValue("");
  await expect(form.getByLabel("Price end")).toHaveValue("");

  const tierForm = formWithButton(page, "Save tier");
  await expect(tierForm.getByLabel("Price start")).toHaveValue("01/09/2027");
  await expect(tierForm.getByLabel("Price end")).toHaveValue("30/09/2027");
});
