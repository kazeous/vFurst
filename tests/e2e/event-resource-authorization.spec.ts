import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { loginWithCredentials } from "./support/credentials-login";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "ResourceAccessPass123!";
const ownerAEmail = `resource-owner-a-${runId}@example.com`;
const ownerBEmail = `resource-owner-b-${runId}@example.com`;
const orgASlug = `resource-org-a-${runId}`;
const orgBSlug = `resource-org-b-${runId}`;
const attackTierName = `Cross-tenant tier ${runId}`;
const attackAddOnName = `Cross-tenant add-on ${runId}`;

let orgAId: string;
let eventAId: string;
let eventBId: string;
let tierAId: string;
let tierBId: string;
let addOnAId: string;
let addOnBId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [ownerA, ownerB] = await Promise.all([
    prisma.user.create({
      data: {
        email: ownerAEmail,
        name: "Resource Owner A",
        passwordHash
      }
    }),
    prisma.user.create({
      data: {
        email: ownerBEmail,
        name: "Resource Owner B",
        passwordHash
      }
    })
  ]);

  const [orgA, orgB] = await Promise.all([
    prisma.organization.create({
      data: {
        name: "Resource Organization A",
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
            name: "Resource Event A",
            slug: "resource-event-a",
            startDate: new Date("2027-11-01T09:00:00Z"),
            endDate: new Date("2027-11-02T17:00:00Z")
          }
        }
      },
      include: {
        events: true
      }
    }),
    prisma.organization.create({
      data: {
        name: "Resource Organization B",
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
            name: "Resource Event B",
            slug: "resource-event-b",
            startDate: new Date("2027-12-01T09:00:00Z"),
            endDate: new Date("2027-12-02T17:00:00Z")
          }
        }
      },
      include: {
        events: true
      }
    })
  ]);

  orgAId = orgA.id;
  eventAId = orgA.events[0]!.id;
  eventBId = orgB.events[0]!.id;

  const [tierA, tierB] = await Promise.all([
    prisma.registrationType.create({
      data: {
        orgId: orgA.id,
        eventId: eventAId,
        name: "Resource Tier A",
        price: 5000
      }
    }),
    prisma.registrationType.create({
      data: {
        orgId: orgB.id,
        eventId: eventBId,
        name: "Resource Tier B",
        price: 6000
      }
    })
  ]);

  tierAId = tierA.id;
  tierBId = tierB.id;

  const [addOnA, addOnB] = await Promise.all([
    prisma.addOnDefinition.create({
      data: {
        orgId: orgA.id,
        registrationTypeId: tierA.id,
        name: "Resource Add-on A",
        price: 1000
      }
    }),
    prisma.addOnDefinition.create({
      data: {
        orgId: orgB.id,
        registrationTypeId: tierB.id,
        name: "Resource Add-on B",
        price: 1200
      }
    })
  ]);

  addOnAId = addOnA.id;
  addOnBId = addOnB.id;
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
      if (!(error instanceof Error) || !error.message.includes("ERR_ABORTED") || attempt === 2) {
        throw error;
      }
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
      const form = formElement as HTMLFormElement;
      const input = form.querySelector<HTMLInputElement>(`input[name="${tamper.fieldName}"]`);
      const button = Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => candidate.textContent?.trim() === tamper.buttonName
      );

      if (!input || !button) {
        throw new Error("Expected mutation form controls were not found.");
      }

      input.value = tamper.fieldValue;
      form.requestSubmit(button);
    },
    { buttonName, fieldName, fieldValue }
  );
  await responsePromise;
}

test("event mutations derive authorization from the stored event", async ({ page }) => {
  await loginAsOwnerA(page);

  const organizationPath = `/dashboard/organizations/${orgAId}`;
  await page.goto(organizationPath);
  const publishForm = page.getByRole("button", { name: "Publish", exact: true }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, organizationPath, publishForm, "Publish", "eventId", eventBId);

  const eventAfterPublishAttempt = await prisma.event.findUniqueOrThrow({ where: { id: eventBId } });
  expect(eventAfterPublishAttempt.status).toBe("DRAFT");
  expect((await prisma.event.findUniqueOrThrow({ where: { id: eventAId } })).status).toBe("DRAFT");

  const settingsPath = `/dashboard/events/${eventAId}/settings`;
  await navigateAfterRejectedAction(page, settingsPath);
  const settingsForm = page.getByRole("button", { name: "Save event settings" }).locator("xpath=ancestor::form");
  await page.getByLabel("Name").fill("Cross-tenant event overwrite");
  await submitTamperedAction(page, settingsPath, settingsForm, "Save event settings", "eventId", eventBId);

  const eventAfterSettingsAttempt = await prisma.event.findUniqueOrThrow({ where: { id: eventBId } });
  expect(eventAfterSettingsAttempt.name).toBe("Resource Event B");
  expect((await prisma.event.findUniqueOrThrow({ where: { id: eventAId } })).name).toBe("Resource Event A");
});

test("registration tier mutations cannot combine an owned page with foreign resource IDs", async ({ page }) => {
  await loginAsOwnerA(page);
  const typesPath = `/dashboard/events/${eventAId}/registrations/types`;

  await navigateAfterRejectedAction(page, typesPath);
  const createForm = page.getByRole("button", { name: "Create tier" }).locator("xpath=ancestor::form");
  await createForm.getByLabel("Name").fill(attackTierName);
  await createForm.locator('input[name="price"]').fill("10.00");
  await submitTamperedAction(page, typesPath, createForm, "Create tier", "eventId", eventBId);
  expect(await prisma.registrationType.count({ where: { name: attackTierName } })).toBe(0);

  await navigateAfterRejectedAction(page, typesPath);
  const updateForm = page.getByRole("button", { name: "Save tier" }).locator("xpath=ancestor::form");
  await updateForm.getByLabel("Name").fill("Cross-tenant tier overwrite");
  await submitTamperedAction(page, typesPath, updateForm, "Save tier", "typeId", tierBId);
  expect((await prisma.registrationType.findUniqueOrThrow({ where: { id: tierBId } })).name).toBe("Resource Tier B");
  expect((await prisma.registrationType.findUniqueOrThrow({ where: { id: tierAId } })).name).toBe("Resource Tier A");

  await navigateAfterRejectedAction(page, typesPath);
  const deleteForm = page.getByRole("button", { name: "Delete tier" }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, typesPath, deleteForm, "Delete tier", "typeId", tierBId);
  expect(await prisma.registrationType.findUnique({ where: { id: tierBId } })).not.toBeNull();
  expect(await prisma.registrationType.findUnique({ where: { id: tierAId } })).not.toBeNull();
});

test("add-on mutations cannot combine an owned page with foreign resource IDs", async ({ page }) => {
  await loginAsOwnerA(page);
  const typesPath = `/dashboard/events/${eventAId}/registrations/types`;

  await navigateAfterRejectedAction(page, typesPath);
  const createForm = page.getByRole("button", { name: "Add", exact: true }).locator("xpath=ancestor::form");
  await createForm.getByLabel("Name").fill(attackAddOnName);
  await createForm.locator('input[name="price"]').fill("5.00");
  await submitTamperedAction(page, typesPath, createForm, "Add", "typeId", tierBId);
  expect(await prisma.addOnDefinition.count({ where: { name: attackAddOnName } })).toBe(0);

  await navigateAfterRejectedAction(page, typesPath);
  const updateForm = page.getByRole("button", { name: "Save", exact: true }).locator("xpath=ancestor::form");
  await updateForm.getByLabel("Name").fill("Cross-tenant add-on overwrite");
  await submitTamperedAction(page, typesPath, updateForm, "Save", "addOnId", addOnBId);
  expect((await prisma.addOnDefinition.findUniqueOrThrow({ where: { id: addOnBId } })).name).toBe("Resource Add-on B");
  expect((await prisma.addOnDefinition.findUniqueOrThrow({ where: { id: addOnAId } })).name).toBe("Resource Add-on A");

  await navigateAfterRejectedAction(page, typesPath);
  const deleteForm = page.getByRole("button", { name: "Delete Resource Add-on A" }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, typesPath, deleteForm, "Delete Resource Add-on A", "addOnId", addOnBId);
  expect(await prisma.addOnDefinition.findUnique({ where: { id: addOnBId } })).not.toBeNull();

  expect(await prisma.registrationType.findUnique({ where: { id: tierAId } })).not.toBeNull();
  expect(await prisma.addOnDefinition.findUnique({ where: { id: addOnAId } })).not.toBeNull();
});
