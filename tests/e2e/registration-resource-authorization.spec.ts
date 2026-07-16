import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "RegistrationAccessPass123!";
const ownerAEmail = `registration-owner-a-${runId}@example.com`;
const ownerBEmail = `registration-owner-b-${runId}@example.com`;
const attendeeAEmail = `registration-attendee-a-${runId}@example.com`;
const attendeeBEmail = `registration-attendee-b-${runId}@example.com`;
const historicAttendeeEmail = `registration-historic-${runId}@example.com`;
const historicAttendeeName = `Registration Historic Attendee ${runId}`;
const claimedPassword = "ClaimedAttendeePass123!";
const rotatedPassword = "RotatedAttendeePass123!";
const transferEmail = `registration-transfer-${runId}@example.com`;
const adminTransferEmail = `registration-admin-transfer-${runId}@example.com`;
const phase5TransferEmail = `registration-phase5-transfer-${runId}@example.com`;
const orgASlug = `registration-org-a-${runId}`;
const orgBSlug = `registration-org-b-${runId}`;
const attendeeAName = `Registration Attendee A ${runId}`;
const attendeeBName = `Registration Attendee B ${runId}`;
const noteAContent = `Registration note A ${runId}`;
const noteBContent = `Registration note B ${runId}`;
const attackNoteContent = `Cross-tenant note ${runId}`;

let eventAId: string;
let eventBId: string;
let tierAId: string;
let tierBId: string;
let registrationAId: string;
let registrationBId: string;
let historicAttendeeId: string;
let noteAId: string;
let noteBId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [ownerA, ownerB, attendeeA, attendeeB, historicAttendee] = await Promise.all([
    prisma.user.create({ data: { email: ownerAEmail, name: "Registration Owner A", passwordHash } }),
    prisma.user.create({ data: { email: ownerBEmail, name: "Registration Owner B", passwordHash } }),
    prisma.user.create({ data: { email: attendeeAEmail, name: attendeeAName, passwordHash } }),
    prisma.user.create({ data: { email: attendeeBEmail, name: attendeeBName, passwordHash } }),
    prisma.user.create({ data: { email: historicAttendeeEmail, name: historicAttendeeName } })
  ]);
  historicAttendeeId = historicAttendee.id;

  const [orgA, orgB] = await Promise.all([
    prisma.organization.create({
      data: {
        name: "Registration Organization A",
        slug: orgASlug,
        subdomain: orgASlug,
        contactEmail: ownerAEmail,
        status: "ACTIVE",
        members: { create: { userId: ownerA.id, role: "OWNER" } },
        events: {
          create: {
            name: "Registration Event A",
            slug: "registration-event-a",
            status: "PUBLISHED",
            startDate: new Date("2028-01-01T09:00:00Z"),
            endDate: new Date("2028-01-02T17:00:00Z")
          }
        }
      },
      include: { events: true }
    }),
    prisma.organization.create({
      data: {
        name: "Registration Organization B",
        slug: orgBSlug,
        subdomain: orgBSlug,
        contactEmail: ownerBEmail,
        status: "ACTIVE",
        members: { create: { userId: ownerB.id, role: "OWNER" } },
        events: {
          create: {
            name: "Registration Event B",
            slug: "registration-event-b",
            status: "PUBLISHED",
            startDate: new Date("2028-02-01T09:00:00Z"),
            endDate: new Date("2028-02-02T17:00:00Z")
          }
        }
      },
      include: { events: true }
    })
  ]);

  eventAId = orgA.events[0]!.id;
  eventBId = orgB.events[0]!.id;

  const [tierA, tierB] = await Promise.all([
    prisma.registrationType.create({
      data: { orgId: orgA.id, eventId: eventAId, name: "Registration Tier A", price: 5000 }
    }),
    prisma.registrationType.create({
      data: { orgId: orgB.id, eventId: eventBId, name: "Registration Tier B", price: 6000 }
    })
  ]);
  tierAId = tierA.id;
  tierBId = tierB.id;

  const [registrationA, registrationB] = await Promise.all([
    prisma.registration.create({
      data: { orgId: orgA.id, eventId: eventAId, userId: attendeeA.id, typeId: tierA.id, status: "PENDING" }
    }),
    prisma.registration.create({
      data: { orgId: orgB.id, eventId: eventBId, userId: attendeeB.id, typeId: tierB.id, status: "PENDING" }
    })
  ]);
  registrationAId = registrationA.id;
  registrationBId = registrationB.id;
  await prisma.registration.create({
    data: { orgId: orgA.id, eventId: eventAId, userId: historicAttendee.id, typeId: tierA.id, status: "PENDING" }
  });

  const [noteA, noteB] = await Promise.all([
    prisma.attendeeNote.create({
      data: { orgId: orgA.id, registrationId: registrationA.id, authorId: ownerA.id, content: noteAContent }
    }),
    prisma.attendeeNote.create({
      data: { orgId: orgB.id, registrationId: registrationB.id, authorId: ownerB.id, content: noteBContent }
    })
  ]);
  noteAId = noteA.id;
  noteBId = noteB.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [orgASlug, orgBSlug] } } });
  if (historicAttendeeId) {
    await prisma.verificationToken.deleteMany({ where: { identifier: `password-reset:${historicAttendeeId}` } });
  }
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          ownerAEmail,
          ownerBEmail,
          attendeeAEmail,
          attendeeBEmail,
          historicAttendeeEmail,
          transferEmail,
          adminTransferEmail,
          phase5TransferEmail
        ]
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

async function loginAsAttendeeA(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(attendeeAEmail);
  await page.getByLabel("Password").fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith("/login") && response.request().method() === "POST"),
    page.getByRole("button", { name: "Log in" }).click({ noWaitAfter: true })
  ]);
  await page.goto("/account/registrations");
  await expect(page.getByRole("heading", { name: "My registrations" })).toBeVisible({ timeout: 30_000 });
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
      const control = form.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${tamper.fieldName}"]`);
      const button = Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => candidate.textContent?.trim() === tamper.buttonName
      );
      if (!control || !button) throw new Error("Expected mutation form controls were not found.");
      if (control instanceof HTMLSelectElement && !Array.from(control.options).some((option) => option.value === tamper.fieldValue)) {
        control.add(new Option("Tampered foreign resource", tamper.fieldValue));
      }
      control.value = tamper.fieldValue;
      form.requestSubmit(button);
    },
    { buttonName, fieldName, fieldValue }
  );
  await responsePromise;
}

async function expectOriginalRegistrations() {
  const [registrationA, registrationB] = await Promise.all([
    prisma.registration.findUniqueOrThrow({ where: { id: registrationAId } }),
    prisma.registration.findUniqueOrThrow({ where: { id: registrationBId } })
  ]);
  expect(registrationA.status).toBe("PENDING");
  expect(registrationA.typeId).toBe(tierAId);
  expect(registrationB.status).toBe("PENDING");
  expect(registrationB.typeId).toBe(tierBId);
}

test("attendee account and success lookup expose only registrations owned by the session", async ({ page }) => {
  await loginAsAttendeeA(page);
  await expect(page.getByText("Registration Event A")).toBeVisible();
  await expect(page.getByText("Registration Event B")).toHaveCount(0);
  expect((await page.request.get(`/account/registrations/${registrationAId}`)).status()).toBe(200);
  expect((await page.request.get(`/account/registrations/${registrationBId}`)).status()).toBe(404);

  await page.goto(`/${orgASlug}/register?success=${registrationBId}`);
  await expect(page.getByText(attendeeBName)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Registration confirmed" })).toHaveCount(0);

  await page.goto(`/${orgASlug}/register?success=${registrationAId}`);
  await expect(page.getByText(attendeeAName)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registration confirmed" })).toBeVisible();
});

test("password recovery gives an unknown email the same generic acknowledgement", async ({ page }) => {
  const unknownEmail = `registration-unknown-${runId}@example.com`;
  await page.goto("/forgot-password?returnTo=%2Faccount");
  await page.getByLabel("Email").fill(unknownEmail);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page).toHaveURL(/\/forgot-password\?sent=1/);
  await expect(page.getByText("If an account exists for that email, a one-hour reset link has been sent.")).toBeVisible();
  expect(await prisma.user.count({ where: { email: unknownEmail } })).toBe(0);
});

test("a legacy email-created attendee can securely claim their existing records with a one-time reset token", async ({ page }) => {
  const expiredRawToken = randomBytes(32).toString("hex");
  const identifier = `password-reset:${historicAttendeeId}`;
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: createHash("sha256").update(expiredRawToken).digest("hex"),
      expires: new Date(Date.now() - 1_000)
    }
  });

  await page.goto(`/reset-password?token=${expiredRawToken}`);
  await page.getByLabel("New password").fill(claimedPassword);
  await page.getByLabel("Confirm password").fill(claimedPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/reset-password\?invalid=1/);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: historicAttendeeId } })).passwordHash).toBeNull();
  await prisma.verificationToken.deleteMany({ where: { identifier } });

  const rawToken = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: createHash("sha256").update(rawToken).digest("hex"),
      expires: new Date(Date.now() + 60_000)
    }
  });

  await page.goto(`/reset-password?token=${rawToken}&returnTo=${encodeURIComponent("/account/registrations")}`);
  await page.getByLabel("New password").fill(claimedPassword);
  await page.getByLabel("Confirm password").fill(claimedPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login\?/, { timeout: 30_000 });
  await expect(page.getByText("Password updated. You can log in now.")).toBeVisible();

  await page.goto(`/reset-password?token=${rawToken}`);
  await page.getByLabel("New password").fill("ReplayAttemptPass123!");
  await page.getByLabel("Confirm password").fill("ReplayAttemptPass123!");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/reset-password\?invalid=1/);

  await page.goto("/login?returnTo=%2Faccount%2Fregistrations");
  await page.getByLabel("Email").fill(historicAttendeeEmail);
  await page.getByLabel("Password").fill(claimedPassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/account\/registrations$/, { timeout: 30_000 });
  await expect(page.getByText("Registration Event A")).toBeVisible();

  expect(await prisma.verificationToken.count({ where: { identifier } })).toBe(0);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: historicAttendeeId } })).passwordHash).not.toBeNull();
});

test("password recovery invalidates JWT sessions issued before the credential change", async ({ page }) => {
  await page.goto("/login?returnTo=%2Faccount");
  await page.getByLabel("Email").fill(historicAttendeeEmail);
  await page.getByLabel("Password").fill(claimedPassword);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/account$/, { timeout: 30_000 });

  const rawToken = randomBytes(32).toString("hex");
  const identifier = `password-reset:${historicAttendeeId}`;
  await prisma.verificationToken.create({
    data: {
      identifier,
      token: createHash("sha256").update(rawToken).digest("hex"),
      expires: new Date(Date.now() + 60_000)
    }
  });

  await page.goto(`/reset-password?token=${rawToken}`);
  await page.getByLabel("New password").fill(rotatedPassword);
  await page.getByLabel("Confirm password").fill(rotatedPassword);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/login\?reset=1/);

  await page.goto("/account");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Faccount/, { timeout: 30_000 });
});

test("status, refund, and email actions reject a foreign registration ID", async ({ page }) => {
  await loginAsOwnerA(page);
  const detailPath = `/dashboard/events/${eventAId}/registrations/${registrationAId}`;
  expect((await page.request.get(`/dashboard/events/${eventAId}/registrations/${registrationBId}`)).status()).toBe(404);

  for (const buttonName of ["Confirm", "Cancel", "Refund", "Resend email"]) {
    await navigateAfterRejectedAction(page, detailPath);
    const form = page.getByRole("button", { name: buttonName, exact: true }).locator("xpath=ancestor::form");
    await submitTamperedAction(page, detailPath, form, buttonName, "registrationId", registrationBId);
    await expectOriginalRegistrations();
  }
});

test("tier upgrade rejects both a foreign registration and a foreign target tier", async ({ page }) => {
  await loginAsOwnerA(page);
  const detailPath = `/dashboard/events/${eventAId}/registrations/${registrationAId}`;

  await navigateAfterRejectedAction(page, detailPath);
  let form = page.getByRole("button", { name: "Upgrade", exact: true }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, detailPath, form, "Upgrade", "registrationId", registrationBId);
  await expectOriginalRegistrations();

  await navigateAfterRejectedAction(page, detailPath);
  form = page.getByRole("button", { name: "Upgrade", exact: true }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, detailPath, form, "Upgrade", "typeId", tierBId);
  await expectOriginalRegistrations();
});

test("bulk and attendee-note mutations reject mixed or foreign resources", async ({ page }) => {
  await loginAsOwnerA(page);
  const registrationsPath = `/dashboard/events/${eventAId}/registrations`;

  await navigateAfterRejectedAction(page, registrationsPath);
  const bulkForm = page.getByRole("button", { name: "Cancel selected" }).locator("xpath=ancestor::form");
  await submitTamperedAction(
    page,
    registrationsPath,
    bulkForm,
    "Cancel selected",
    "registrationIds",
    `${registrationAId},${registrationBId}`
  );
  await expectOriginalRegistrations();

  const detailPath = `/dashboard/events/${eventAId}/registrations/${registrationAId}`;
  await navigateAfterRejectedAction(page, detailPath);
  const createNoteForm = page.getByRole("button", { name: "Add note" }).locator("xpath=ancestor::form");
  await createNoteForm.getByLabel("Note").fill(attackNoteContent);
  await submitTamperedAction(page, detailPath, createNoteForm, "Add note", "registrationId", registrationBId);
  expect(await prisma.attendeeNote.count({ where: { content: attackNoteContent } })).toBe(0);

  await navigateAfterRejectedAction(page, detailPath);
  const deleteNoteForm = page.getByRole("button", { name: "Delete", exact: true }).locator("xpath=ancestor::form");
  await submitTamperedAction(page, detailPath, deleteNoteForm, "Delete", "noteId", noteBId);
  expect(await prisma.attendeeNote.findUnique({ where: { id: noteAId } })).not.toBeNull();
  expect(await prisma.attendeeNote.findUnique({ where: { id: noteBId } })).not.toBeNull();
});

test("all transfer actions derive tenant and event from the source registration", async ({ page }) => {
  await loginAsOwnerA(page);
  const detailPath = `/dashboard/events/${eventAId}/registrations/${registrationAId}`;

  await navigateAfterRejectedAction(page, detailPath);
  const detailTransferForm = page.getByRole("button", { name: "Transfer registration" }).locator("xpath=ancestor::form");
  await detailTransferForm.getByLabel("New attendee name").fill("Rejected Detail Transfer");
  await detailTransferForm.getByLabel("New attendee email").fill(transferEmail);
  await submitTamperedAction(page, detailPath, detailTransferForm, "Transfer registration", "registrationId", registrationBId);

  const transfersPath = `/dashboard/events/${eventAId}/registrations/transfers`;
  await navigateAfterRejectedAction(page, transfersPath);
  const requestForm = page.getByRole("button", { name: "Send transfer email" }).locator("xpath=ancestor::form");
  await requestForm.getByLabel("Recipient email").fill(phase5TransferEmail);
  await submitTamperedAction(page, transfersPath, requestForm, "Send transfer email", "registrationId", registrationBId);

  await navigateAfterRejectedAction(page, transfersPath);
  const adminForm = page.getByRole("button", { name: "Transfer registration" }).locator("xpath=ancestor::form");
  await adminForm.getByLabel("New attendee name").fill("Rejected Admin Transfer");
  await adminForm.getByLabel("New attendee email").fill(adminTransferEmail);
  await submitTamperedAction(page, transfersPath, adminForm, "Transfer registration", "registrationId", registrationBId);

  await expectOriginalRegistrations();
  expect(await prisma.registration.count({ where: { transferredFromId: registrationBId } })).toBe(0);
  expect(
    await prisma.user.count({ where: { email: { in: [transferEmail, adminTransferEmail, phase5TransferEmail] } } })
  ).toBe(0);
});
