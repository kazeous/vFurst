import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { createPortalAccountFixture, loginAsAttendee, portalOrigin } from "./support/portal";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

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
  const [ownerA, ownerB] = await Promise.all([
    prisma.user.create({ data: { email: ownerAEmail, name: "Registration Owner A", ...staffIdentityData() } }),
    prisma.user.create({ data: { email: ownerBEmail, name: "Registration Owner B", ...staffIdentityData() } })
  ]);

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

  const attendeeA = await createPortalAccountFixture(prisma, { orgId: orgA.id, email: attendeeAEmail, name: attendeeAName, password });
  const attendeeB = await createPortalAccountFixture(prisma, { orgId: orgB.id, email: attendeeBEmail, name: attendeeBName, password });
  const historicAttendee = await prisma.portalAccount.create({ data: { orgId: orgA.id, email: historicAttendeeEmail, name: historicAttendeeName } });
  historicAttendeeId = historicAttendee.id;

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
      data: { orgId: orgA.id, eventId: eventAId, portalAccountId: attendeeA.id, typeId: tierA.id, status: "PENDING" }
    }),
    prisma.registration.create({
      data: { orgId: orgB.id, eventId: eventBId, portalAccountId: attendeeB.id, typeId: tierB.id, status: "PENDING" }
    })
  ]);
  registrationAId = registrationA.id;
  registrationBId = registrationB.id;
  await prisma.registration.create({
    data: { orgId: orgA.id, eventId: eventAId, portalAccountId: historicAttendee.id, typeId: tierA.id, status: "PENDING" }
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
  await loginAsStaffEmail(page, ownerAEmail);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible({ timeout: 30_000 });
}

async function loginAsAttendeeA(page: Page) {
  await loginAsAttendee(page, { subdomain: orgASlug }, attendeeAEmail, { password, returnTo: "/account/registrations" });
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
    (response) => new URL(response.url()).pathname === new URL(pathname, "http://localhost:3000").pathname && response.request().method() === "POST"
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
  await expect(page.getByRole("heading", { name: "Registration Event A", level: 3, exact: true })).toBeVisible();
  await expect(page.getByText("Registration Event B")).toHaveCount(0);
  expect(await page.evaluate(async (url) => (await fetch(url, { cache: "no-store" })).status, `${portalOrigin(orgASlug)}/account/registrations/${registrationAId}`)).toBe(200);
  expect(await page.evaluate(async (url) => (await fetch(url, { cache: "no-store" })).status, `${portalOrigin(orgASlug)}/account/registrations/${registrationBId}`)).toBe(404);

  await page.goto(`${portalOrigin(orgASlug)}/register?success=${registrationBId}`);
  await expect(page.getByText(attendeeBName)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Registration confirmed" })).toHaveCount(0);

  await page.goto(`${portalOrigin(orgASlug)}/register?success=${registrationAId}`);
  await expect(page.getByText(attendeeAName)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Registration confirmed" })).toBeVisible();
});

const recoverySent = "Check your email. If this address can be used here, we sent a link that expires in one hour.";
const invalidSetupLink = "This link is invalid, expired, or has already been used.";

async function savePortalPassword(page: Page, value: string) {
  await page.getByLabel("Name", { exact: true }).fill(historicAttendeeName);
  await page.getByLabel("New password", { exact: true }).fill(value);
  await page.getByLabel("Confirm password", { exact: true }).fill(value);
  const loaded = page.waitForEvent("load");
  await page.getByRole("button", { name: "Save password", exact: true }).click();
  await loaded;
  await page.waitForLoadState("load");
}

test("password recovery gives an unknown email the same generic acknowledgement", async ({ page }) => {
  const unknownEmail = `registration-unknown-${runId}@example.com`;
  const account = await prisma.portalAccount.findUniqueOrThrow({ where: { id: historicAttendeeId } });
  const origin = portalOrigin(orgASlug);
  for (const email of [unknownEmail, attendeeAEmail]) {
    await page.goto(`${origin}/forgot-password`);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Send link", exact: true }).click();
    await expect(page).toHaveURL(`${origin}/forgot-password`);
    await expect(page.getByRole("status").filter({ hasText: recoverySent })).toHaveText(recoverySent);
  }
  expect(await prisma.user.count({ where: { email: unknownEmail } })).toBe(0);
  expect(await prisma.portalAccount.count({ where: { orgId: account.orgId, email: unknownEmail } })).toBe(0);
});

test("an unclaimed attendee can securely claim existing records with a one-time setup token", async ({ page, context }) => {
  const account = await prisma.portalAccount.findUniqueOrThrow({ where: { id: historicAttendeeId } });
  const ownership = { orgId: account.orgId, portalAccountId: account.id };
  const registrations = await prisma.registration.findMany({ where: ownership, select: { id: true } });
  const sessionsBefore = await prisma.portalSession.count({ where: ownership });
  const expiredRawToken = randomBytes(32).toString("base64url");
  await prisma.portalAccountToken.create({ data: {
    ...ownership, purpose: "ACCOUNT_SETUP", tokenHash: createHash("sha256").update(expiredRawToken).digest("hex"), expiresAt: new Date(Date.now() - 1_000)
  } });
  const origin = portalOrigin(orgASlug);
  await page.goto(`${origin}/set-password?token=${expiredRawToken}`);
  await expect(page.getByRole("alert").filter({ hasText: invalidSetupLink })).toHaveText(invalidSetupLink);
  await expect(page.getByRole("button", { name: "Save password", exact: true })).toHaveCount(0);
  const unchanged = await prisma.portalAccount.findUniqueOrThrow({ where: { id: account.id } });
  expect(unchanged.passwordHash).toBeNull();
  expect(unchanged.emailVerifiedAt).toBeNull();
  expect(await prisma.portalSession.count({ where: ownership })).toBe(sessionsBefore);
  expect(await prisma.registration.findMany({ where: ownership, select: { id: true } })).toEqual(registrations);

  const rawToken = randomBytes(32).toString("base64url");
  const setup = await prisma.portalAccountToken.create({ data: {
    ...ownership, purpose: "ACCOUNT_SETUP", tokenHash: createHash("sha256").update(rawToken).digest("hex"), expiresAt: new Date(Date.now() + 60_000)
  } });
  const setupUrl = `${origin}/set-password?token=${rawToken}&returnTo=${encodeURIComponent("/account/registrations")}`;
  await page.goto(setupUrl);
  await savePortalPassword(page, claimedPassword);
  await expect(page).toHaveURL(`${origin}/account/registrations`, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Registration Event A", level: 3, exact: true })).toBeVisible();
  expect(await prisma.registration.findMany({ where: ownership, select: { id: true } })).toEqual(registrations);
  const claimed = await prisma.portalAccount.findUniqueOrThrow({ where: { id: account.id } });
  expect(claimed.passwordHash).not.toBeNull();
  expect(claimed.emailVerifiedAt).not.toBeNull();
  expect((await prisma.portalAccountToken.findUniqueOrThrow({ where: { id: setup.id } })).consumedAt).not.toBeNull();
  expect(await prisma.portalAccountToken.count({ where: { ...ownership, purpose: "ACCOUNT_SETUP", consumedAt: null, expiresAt: { gt: new Date() } } })).toBe(0);

  await page.goto(setupUrl);
  await expect(page.getByRole("alert").filter({ hasText: invalidSetupLink })).toHaveText(invalidSetupLink);
  await expect(page.getByRole("button", { name: "Save password", exact: true })).toHaveCount(0);
  expect((await prisma.portalAccount.findUniqueOrThrow({ where: { id: account.id } })).passwordHash).toBe(claimed.passwordHash);
  await context.clearCookies({ name: "vfurst-portal" });
  await loginAsAttendee(page, { subdomain: orgASlug }, historicAttendeeEmail, { password: claimedPassword, returnTo: "/account/registrations" });
  await expect(page.getByRole("heading", { name: "Registration Event A", level: 3, exact: true })).toBeVisible();
});

test("password recovery invalidates portal sessions issued before the credential change", async ({ page, context, browser }) => {
  const origin = portalOrigin(orgASlug);
  await loginAsAttendee(page, { subdomain: orgASlug }, historicAttendeeEmail, { password: claimedPassword });
  await expect(page).toHaveURL(`${origin}/account`, { timeout: 30_000 });
  const oldCookie = (await context.cookies(origin)).find((cookie) => cookie.name === "vfurst-portal");
  expect(oldCookie).toBeDefined();
  const oldSession = await prisma.portalSession.findUniqueOrThrow({ where: { tokenHash: createHash("sha256").update(oldCookie!.value).digest("hex") } });
  const account = await prisma.portalAccount.findUniqueOrThrow({ where: { id: historicAttendeeId } });
  const rawToken = randomBytes(32).toString("base64url");
  const reset = await prisma.portalAccountToken.create({ data: {
    orgId: account.orgId, portalAccountId: account.id, purpose: "PASSWORD_RESET", tokenHash: createHash("sha256").update(rawToken).digest("hex"), expiresAt: new Date(Date.now() + 60_000)
  } });
  const resetContext = await browser.newContext({ serviceWorkers: "block" });
  try {
    const resetPage = await resetContext.newPage();
    await resetPage.goto(`${origin}/set-password?token=${rawToken}&returnTo=%2Faccount`);
    await savePortalPassword(resetPage, rotatedPassword);
    await expect(resetPage).toHaveURL(`${origin}/account`, { timeout: 30_000 });
    const rotated = await prisma.portalAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(rotated.authVersion).toBe(account.authVersion + 1);
    expect((await prisma.portalAccountToken.findUniqueOrThrow({ where: { id: reset.id } })).consumedAt).not.toBeNull();
    const newCookie = (await resetContext.cookies(origin)).find((cookie) => cookie.name === "vfurst-portal");
    expect(newCookie).toBeDefined();
    const newSession = await prisma.portalSession.findUniqueOrThrow({ where: { tokenHash: createHash("sha256").update(newCookie!.value).digest("hex") } });
    expect(newSession.id).not.toBe(oldSession.id);
    expect(newSession).toMatchObject({ orgId: account.orgId, portalAccountId: account.id, authVersion: rotated.authVersion, revokedAt: null });
    expect(newSession.expiresAt.getTime()).toBeGreaterThan(Date.now());
    const invalidated = await prisma.portalSession.findUniqueOrThrow({ where: { id: oldSession.id } });
    expect(invalidated.revokedAt !== null || invalidated.authVersion !== rotated.authVersion).toBe(true);
    await page.goto(`${origin}/account`);
    await expect(page).toHaveURL(`${origin}/login?returnTo=%2Faccount`, { timeout: 30_000 });
    await resetContext.clearCookies({ name: "vfurst-portal" });
    await loginAsAttendee(resetPage, { subdomain: orgASlug }, historicAttendeeEmail, { password: rotatedPassword });
    await expect(resetPage).toHaveURL(`${origin}/account`);
  } finally {
    await resetContext.close();
  }
});

test("status, refund, and email actions reject a foreign registration ID", async ({ page }) => {
  await loginAsOwnerA(page);
  const detailPath = `/dashboard/events/${eventAId}/registrations/${registrationAId}`;
  expect((await page.request.get(`/dashboard/events/${eventAId}/registrations/${registrationBId}`)).status()).toBe(404);

  for (const buttonName of ["Approve registration", "Cancel", "Refund", "Resend email"]) {
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
  expect(await prisma.portalAccount.count({ where: { orgId: (await prisma.event.findUniqueOrThrow({ where: { id: eventAId } })).orgId, email: { in: [transferEmail, adminTransferEmail, phase5TransferEmail] } } })).toBe(0);
});
