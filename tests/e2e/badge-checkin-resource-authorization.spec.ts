import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { attendeeProfileFixture, createPortalAccountFixture } from "./support/portal";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "BadgeCheckInPass123!";
const ownerAEmail = `badge-owner-a-${runId}@example.com`;
const ownerBEmail = `badge-owner-b-${runId}@example.com`;
const attendeeAEmail = `badge-attendee-a-${runId}@example.com`;
const attendeeA2Email = `badge-attendee-a2-${runId}@example.com`;
const attendeeBEmail = `badge-attendee-b-${runId}@example.com`;
const rejectedWalkInEmail = `badge-rejected-walkin-${runId}@example.com`;
const validWalkInEmail = `badge-valid-walkin-${runId}@example.com`;
const orgASlug = `badge-org-a-${runId}`;
const orgBSlug = `badge-org-b-${runId}`;
const attendeeAName = `Badge Attendee A ${runId}`;
const attendeeA2Name = `Badge Attendee A2 ${runId}`;

let eventAId: string;
let eventBId: string;
let tierAId: string;
let tierBId: string;
let registrationAId: string;
let registrationA2Id: string;
let registrationBId: string;
let templateAId: string;
let templateBId: string;
let badgeAId: string;
let badgeBId: string;

const layout = {
  width: 360,
  height: 240,
  elements: [
    {
      id: "name",
      type: "text",
      x: 24,
      y: 24,
      w: 240,
      h: 36,
      field: "attendee.name",
      value: "{{attendee.name}}"
    }
  ]
};

test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const [ownerA, ownerB] = await Promise.all([
    prisma.user.create({ data: { email: ownerAEmail, name: "Badge Owner A", ...staffIdentityData() } }),
    prisma.user.create({ data: { email: ownerBEmail, name: "Badge Owner B", ...staffIdentityData() } })
  ]);

  const [orgA, orgB] = await Promise.all([
    prisma.organization.create({
      data: {
        name: "Badge Organization A",
        slug: orgASlug,
        subdomain: orgASlug,
        contactEmail: ownerAEmail,
        status: "ACTIVE",
        members: { create: { userId: ownerA.id, role: "OWNER" } },
        events: {
          create: {
            name: "Badge Event A",
            slug: "badge-event-a",
            currency: "VND",
            status: "PUBLISHED",
            startDate: new Date("2028-03-01T09:00:00Z"),
            endDate: new Date("2028-03-02T17:00:00Z")
          }
        }
      },
      include: { events: true }
    }),
    prisma.organization.create({
      data: {
        name: "Badge Organization B",
        slug: orgBSlug,
        subdomain: orgBSlug,
        contactEmail: ownerBEmail,
        status: "ACTIVE",
        members: { create: { userId: ownerB.id, role: "OWNER" } },
        events: {
          create: {
            name: "Badge Event B",
            slug: "badge-event-b",
            status: "PUBLISHED",
            startDate: new Date("2028-04-01T09:00:00Z"),
            endDate: new Date("2028-04-02T17:00:00Z")
          }
        }
      },
      include: { events: true }
    })
  ]);

  eventAId = orgA.events[0]!.id;

  const attendeeA = await createPortalAccountFixture(prisma, { orgId: orgA.id, email: attendeeAEmail, name: attendeeAName, password });
  const attendeeA2 = await createPortalAccountFixture(prisma, { orgId: orgA.id, email: attendeeA2Email, name: attendeeA2Name, password });
  const attendeeB = await createPortalAccountFixture(prisma, { orgId: orgB.id, email: attendeeBEmail, name: "Badge Attendee B", password });

  eventBId = orgB.events[0]!.id;

  const [tierA, tierB] = await Promise.all([
    prisma.registrationType.create({
      data: { orgId: orgA.id, eventId: eventAId, name: "Badge Tier A", price: 125_000 }
    }),
    prisma.registrationType.create({
      data: { orgId: orgB.id, eventId: eventBId, name: "Badge Tier B", price: 6500 }
    })
  ]);
  tierAId = tierA.id;
  tierBId = tierB.id;

  const [templateA, templateB] = await Promise.all([
    prisma.badgeTemplate.create({
      data: {
        orgId: orgA.id,
        eventId: eventAId,
        name: "Badge Template A",
        layout,
        dimensions: { width: 360, height: 240, units: "pt" }
      }
    }),
    prisma.badgeTemplate.create({
      data: {
        orgId: orgB.id,
        eventId: eventBId,
        name: "Badge Template B",
        layout,
        dimensions: { width: 360, height: 240, units: "pt" }
      }
    })
  ]);
  templateAId = templateA.id;
  templateBId = templateB.id;

  await prisma.event.update({
    where: { id: eventAId },
    data: {
      settings: {
        requireApproval: false,
        allowTransfers: true,
        maxRegistrationsPerUser: 1,
        defaultBadgeTemplateId: templateA.id,
        badgeDefaults: { [tierA.id]: templateA.id }
      }
    }
  });

  const [registrationA, registrationA2, registrationB] = await Promise.all([
    prisma.registration.create({
      data: { orgId: orgA.id, eventId: eventAId, portalAccountId: attendeeA.id, attendeeProfileId: (await attendeeProfileFixture(prisma, { orgId: orgA.id, portalAccountId: attendeeA.id, fullName: attendeeAName })).id, typeId: tierA.id, status: "CONFIRMED" }
    }),
    prisma.registration.create({
      data: { orgId: orgA.id, eventId: eventAId, portalAccountId: attendeeA2.id, attendeeProfileId: (await attendeeProfileFixture(prisma, { orgId: orgA.id, portalAccountId: attendeeA2.id, fullName: attendeeA2Name })).id, typeId: tierA.id, status: "CONFIRMED" }
    }),
    prisma.registration.create({
      data: { orgId: orgB.id, eventId: eventBId, portalAccountId: attendeeB.id, attendeeProfileId: (await attendeeProfileFixture(prisma, { orgId: orgB.id, portalAccountId: attendeeB.id, fullName: "Badge Attendee B" })).id, typeId: tierB.id, status: "CONFIRMED" }
    })
  ]);
  registrationAId = registrationA.id;
  registrationA2Id = registrationA2.id;
  registrationBId = registrationB.id;

  const generatedAt = new Date("2028-01-01T00:00:00Z");
  const [badgeA, badgeB] = await Promise.all([
    prisma.badge.create({
      data: {
        orgId: orgA.id,
        registrationId: registrationA.id,
        templateId: templateA.id,
        barcodeData: `BADGE-A-${runId}`,
        generatedAt,
        pdfUrl: "https://example.com/badge-a.pdf",
        zplData: "^XA^FO20,20^FDATTENDEE A^FS^XZ"
      }
    }),
    prisma.badge.create({
      data: {
        orgId: orgB.id,
        registrationId: registrationB.id,
        templateId: templateB.id,
        barcodeData: `BADGE-B-${runId}`,
        generatedAt,
        pdfUrl: "https://example.com/badge-b.pdf",
        zplData: "^XA^FO20,20^FDATTENDEE B^FS^XZ"
      }
    })
  ]);
  badgeAId = badgeA.id;
  badgeBId = badgeB.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [orgASlug, orgBSlug] } } });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          ownerAEmail,
          ownerBEmail,
          attendeeAEmail,
          attendeeA2Email,
          attendeeBEmail,
          rejectedWalkInEmail,
          validWalkInEmail
        ]
      }
    }
  });
  await prisma.$disconnect();
});

async function loginAsOwnerA(page: Page) {
  await loginAsStaffEmail(page, ownerAEmail);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible({ timeout: 30_000 });
}

/**
 * Opens pathname after a tampered action has been rejected. The action throws
 * on the server, so its POST answers 500 and the route error boundary
 * replaces the page; nothing navigates. Waiting for the boundary asserts the
 * rejection the user sees, and the goto starts only after the page has
 * finished handling the action.
 */
async function navigateAfterRejectedAction(page: Page, pathname: string) {
  await expect(page.getByTestId("route-error")).toBeVisible();
  await page.goto(pathname);
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
      htmlForm.requestSubmit(button);
    },
    { buttonName, fieldName, fieldValue }
  );
  await responsePromise;
}

test("badge image validation renders inline and keeps the template form usable", async ({ page }) => {
  await loginAsOwnerA(page);
  const designerPath = `/dashboard/events/${eventAId}/badges/designer`;
  await page.goto(designerPath);

  await page.getByRole("button", { name: "Image", exact: true }).click();
  await page.locator('input[name^="badgeImage:"]').setInputFiles({
    name: "badge.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')
  });
  await page.getByRole("button", { name: "Save template" }).click();

  await expect(page.getByTestId("badge-template-error")).toContainText(
    "Badge images must be PNG or JPEG files."
  );
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Badge Template A");
  await expect(page.getByRole("button", { name: "Save template" })).toBeEnabled();
  await expect(page.getByTestId("route-error")).toHaveCount(0);
});

test("check-in derives tenant and event from the stored registration", async ({ page }) => {
  await loginAsOwnerA(page);
  const pathname = `/dashboard/events/${eventAId}/check-in`;
  await page.goto(pathname);
  const row = page.locator("article", { hasText: attendeeAName });
  const form = row.getByRole("button", { name: "Check in", exact: true }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, pathname, form, "Check in", "registrationId", registrationBId);

  const [registrationA, registrationB] = await Promise.all([
    prisma.registration.findUniqueOrThrow({ where: { id: registrationAId } }),
    prisma.registration.findUniqueOrThrow({ where: { id: registrationBId } })
  ]);
  expect(registrationA.status).toBe("CONFIRMED");
  expect(registrationB.status).toBe("CONFIRMED");
});

test("badge template, generation, and print confirmation reject foreign resources", async ({ page }) => {
  await loginAsOwnerA(page);
  const designerPath = `/dashboard/events/${eventAId}/badges/designer`;
  await page.goto(designerPath);
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Rejected template overwrite");
  let form = page.getByRole("button", { name: "Save template" }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, designerPath, form, "Save template", "templateId", templateBId);
  expect((await prisma.badgeTemplate.findUniqueOrThrow({ where: { id: templateBId } })).name).toBe("Badge Template B");

  const badgesPath = `/dashboard/events/${eventAId}/badges`;
  await navigateAfterRejectedAction(page, badgesPath);
  form = page.getByRole("button", { name: "Generate batch" }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, badgesPath, form, "Generate batch", "templateId", templateBId);
  expect(await prisma.badge.count({ where: { registrationId: registrationA2Id } })).toBe(0);

  await navigateAfterRejectedAction(page, badgesPath);
  const badgeRow = page.getByText(attendeeAName).locator("xpath=ancestor::div[contains(@class,'vf-table-row')]");
  form = badgeRow.getByRole("button", { name: "Confirm PDF printed" }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, badgesPath, form, "Confirm PDF printed", "badgeId", badgeBId);
  const [badgeA, badgeB] = await Promise.all([
    prisma.badge.findUniqueOrThrow({ where: { id: badgeAId } }),
    prisma.badge.findUniqueOrThrow({ where: { id: badgeBId } })
  ]);
  expect(badgeA.printedAt).toBeNull();
  expect(badgeB.printedAt).toBeNull();

  await navigateAfterRejectedAction(page, badgesPath);
  const localBadgeRow = page.getByText(attendeeAName).locator("xpath=ancestor::div[contains(@class,'vf-table-row')]");
  const localConfirm = localBadgeRow.getByRole("button", { name: "Confirm PDF printed" });
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === badgesPath && response.request().method() === "POST"),
    localConfirm.click()
  ]);
  expect((await prisma.badge.findUniqueOrThrow({ where: { id: badgeAId } })).printedAt).not.toBeNull();
});

test("cashier rejects a foreign tier before creating attendee or commerce records", async ({ page }) => {
  await loginAsOwnerA(page);
  const pathname = `/dashboard/events/${eventAId}/check-in/cashier`;
  await page.goto(pathname);
  const form = page.getByRole("button", { name: "Complete registration" }).locator("xpath=ancestor::form");
  await form.getByLabel("Attendee name").fill("Rejected Walk-in");
  await form.getByLabel("Attendee email").fill(rejectedWalkInEmail);
  await form.getByLabel("Amount collected").fill("125000");
  await submitTamperedAction(page, pathname, form, "Complete registration", "typeId", tierBId);

  expect(await prisma.user.count({ where: { email: rejectedWalkInEmail } })).toBe(0);
  expect(await prisma.portalAccount.count({ where: { orgId: (await prisma.event.findUniqueOrThrow({ where: { id: eventAId } })).orgId, email: rejectedWalkInEmail } })).toBe(0);
  expect(await prisma.order.count({ where: { eventId: eventAId, portalAccount: { email: rejectedWalkInEmail } } })).toBe(0);
});

test("cashier records VND card-terminal collection atomically and leaves printing pending", async ({ page }) => {
  await loginAsOwnerA(page);
  const pathname = `/dashboard/events/${eventAId}/check-in/cashier`;
  await page.goto(pathname);
  const form = page.getByRole("button", { name: "Complete registration" }).locator("xpath=ancestor::form");
  await form.getByLabel("Attendee name").fill("Valid VND Walk-in");
  await form.getByLabel("Attendee email").fill(validWalkInEmail);
  await form.getByLabel("Registration type").selectOption(tierAId);
  await form.getByLabel("Amount collected").fill("125000");
  await form.getByLabel("Payment").selectOption("card");
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"),
    form.getByRole("button", { name: "Complete registration" }).click()
  ]);

  const attendee = await prisma.portalAccount.findUniqueOrThrow({ where: { orgId_email: { orgId: (await prisma.event.findUniqueOrThrow({ where: { id: eventAId } })).orgId, email: validWalkInEmail } } });
  const registration = await prisma.registration.findFirstOrThrow({
    where: { eventId: eventAId, portalAccountId: attendee.id },
    include: { badges: true, orderItems: { include: { order: true } } }
  });
  const order = registration.orderItems[0]!.order;
  expect(registration.orgId).toBe((await prisma.event.findUniqueOrThrow({ where: { id: eventAId } })).orgId);
  expect(registration.typeId).toBe(tierAId);
  expect(registration.status).toBe("CHECKED_IN");
  expect(registration.checkedInAt).not.toBeNull();
  expect(order.currency).toBe("VND");
  expect(order.total).toBe(125_000);
  expect(order.platformFee).toBe(25_000);
  expect(order.status).toBe("PAID");
  expect(registration.badges).toHaveLength(1);
  expect(registration.badges[0]!.templateId).toBe(templateAId);
  expect(registration.badges[0]!.printedAt).toBeNull();
});
