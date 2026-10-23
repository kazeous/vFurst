import { expect, test, type Locator, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { attendeeProfileFixture, createPortalAccountFixture, loginAsAttendee, portalOrigin } from "./support/portal";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const slug = `form-policies-${runId}`;
const origin = portalOrigin(slug);
const ownerEmail = `form-owner-${runId}@example.com`;
const startDate = new Date("2028-05-01T09:00:00Z");
const policyBody = "# Be kind\n\n- Respect one another\n\n[x](javascript:alert(1))\n\n<script>bad()</script>";
const orgIds: string[] = [];
let ownerId: string, orgId: string, eventId: string, typeId: string;
let otherEventId: string, otherDocumentId: string, otherVersionId: string;
let questionId: string, conductId: string, conductVersionId: string, refundId: string;
let firstRegistrationId: string, secondRegistrationId: string;
type Attendee = { id: string; email: string; profileId: string };
let first: Attendee, second: Attendee, stale: Attendee, sender: Attendee, recipient: Attendee;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

async function account(label: string): Promise<Attendee> {
  const account = await createPortalAccountFixture(prisma, { orgId, email: `${label.toLowerCase().replaceAll(" ", "-")}-${runId}@example.com`, name: label });
  const profile = await attendeeProfileFixture(prisma, { orgId, portalAccountId: account.id, fullName: label });
  return { ...account, profileId: profile.id };
}

async function signInAttendee(page: Page, attendee: Attendee) {
  await page.context().clearCookies({ name: "vfurst-portal" });
  await loginAsAttendee(page, { subdomain: slug }, attendee.email);
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(violations, violations.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
}

async function submitTamperedAction(page: Page, pathname: string, form: Locator, buttonName: string, fieldName: string, fieldValue: string) {
  const responsePromise = page.waitForResponse(
    (response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"
  );
  await form.evaluate((formElement, tamper) => {
    const form = formElement as HTMLFormElement;
    const input = form.querySelector<HTMLInputElement>(`input[name="${tamper.fieldName}"]`);
    const button = Array.from(form.querySelectorAll<HTMLButtonElement>("button")).find(
      (candidate) => candidate.textContent?.trim() === tamper.buttonName
    );
    if (!input || !button) throw new Error("Expected mutation form controls were not found.");
    input.value = tamper.fieldValue;
    form.requestSubmit(button);
  }, { buttonName, fieldName, fieldValue });
  await responsePromise;
}

async function details(page: Page, attendee: Attendee) {
  await signInAttendee(page, attendee);
  // The public page intentionally has a 15-second cache; wait for published content.
  await expect.poll(async () => (await (await page.goto(`${origin}/register`))!.text()).includes(conductVersionId),
    { timeout: 30_000, intervals: [500, 1_000] }).toBe(true);
  await page.goto(`${origin}/register?attendee=${attendee.profileId}`);
  await expect(page.locator('[data-registration-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.locator(`input[name="attendee-choice"][value="${attendee.profileId}"]`)).toBeChecked();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Additional details", exact: true })).toBeVisible();
}

async function fillDetails(page: Page, answer = "M", name = "Emergency Person") {
  await page.getByLabel("Contact 1 name", { exact: true }).fill(name);
  await page.getByRole("combobox", { name: "Contact 1 country", exact: true }).selectOption("VN");
  await page.getByLabel("Contact 1 phone", { exact: true }).fill("081 220 5668");
  await page.getByRole("combobox", { name: "T-shirt size", exact: true }).selectOption(answer);
}

async function tickPolicies(page: Page) {
  await page.getByRole("checkbox", { name: "I have read and agree to the Code of Conduct", exact: true }).check();
  await page.getByRole("checkbox", { name: "I have read and agree to the Refund Policy", exact: true }).check();
}

async function complete(page: Page, attendee: Attendee) {
  await page.getByRole("button", { name: "Complete registration", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.has("success"), { waitUntil: "load" });
  return prisma.registration.findFirstOrThrow({ where: { orgId, eventId, portalAccountId: attendee.id, status: "CONFIRMED" } });
}

async function agreements(registrationId: string) {
  return prisma.registrationAgreement.findMany({ where: { registrationId }, include: { version: true }, orderBy: { documentId: "asc" } });
}

test.beforeAll(async () => {
  ownerId = (await prisma.user.create({ data: { email: ownerEmail, name: "Form Owner", ...staffIdentityData() } })).id;
  for (const [subdomain, name] of [[slug, "Form Organization A"], [`${slug}-b`, "Form Organization B"]]) {
    const org = await prisma.organization.create({ data: { name, slug: subdomain, subdomain, contactEmail: ownerEmail, status: "ACTIVE",
      ...(subdomain === slug ? { members: { create: { userId: ownerId, role: "OWNER" } } } : {}) } });
    orgIds.push(org.id);
    const event = await prisma.event.create({ data: { orgId: org.id, name: name + " Event", slug: "form-event", status: "PUBLISHED",
      startDate, endDate: new Date("2028-05-02T17:00:00Z"), settings: { requireApproval: false, allowTransfers: true, maxRegistrationsPerUser: 4 } } });
    if (subdomain === slug) { orgId = org.id; eventId = event.id; }
    else {
      otherEventId = event.id;
      const document = await prisma.policyDocument.create({ data: { orgId: org.id, eventId: event.id } });
      otherDocumentId = document.id;
      otherVersionId = (await prisma.policyDocumentVersion.create({ data: { orgId: org.id, documentId: document.id, version: 1,
        title: "Private B policy", body: "Only organization B.", publishedByUserId: ownerId } })).id;
    }
  }
  typeId = (await prisma.registrationType.create({ data: { orgId, eventId, name: "Form ticket", price: 0 } })).id;
  first = await account("First attendee");
  second = await account("Second attendee");
  stale = await account("Stale attendee");
  sender = await account("Transfer sender");
  recipient = await account("Transfer recipient");
});

test.afterAll(async () => {
  try {
    // Policy publishers and staff attesters must outlive the tenant's cascading rows.
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  } finally { await prisma.$disconnect(); }
});

test("organizer configures contacts, a question and two policies", async ({ page }) => {
  await loginAsStaffEmail(page, ownerEmail, { returnTo: `/dashboard/events/${eventId}/settings/registration-form` });
  await page.getByRole("radio", { name: "Required", exact: true }).check();
  await page.getByRole("combobox", { name: "Contacts to ask for", exact: true }).selectOption("2");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByLabel("Label", { exact: true }).fill("T-shirt size");
  await page.getByLabel("Options", { exact: true }).fill("S, M, L");
  await page.getByRole("checkbox", { name: "Required", exact: true }).check();
  await page.getByRole("button", { name: "Save registration form", exact: true }).click();
  await expect(page.getByText("Registration form saved.", { exact: true })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  const form = (await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).registrationForm as { questions: { id: string }[] };
  questionId = form.questions[0]!.id;

  for (const [title, body] of [["Code of Conduct", policyBody], ["Refund Policy", "Refunds are available before the event."]]) {
    await page.goto(`/dashboard/events/${eventId}/settings/policies/new`);
    await page.getByLabel("Title", { exact: true }).fill(title);
    await page.getByRole("textbox", { name: /^Text\b/ }).fill(body);
    await page.getByRole("button", { name: "Publish version 1", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Version 1 published.");
    await expectNoSeriousAccessibilityViolations(page);
  }
  await page.goto(`/dashboard/events/${eventId}/settings/policies`);
  await expect(page.getByText(/^Version 1 · published/)).toHaveCount(2);
  await expectNoSeriousAccessibilityViolations(page);
  const versions = await prisma.policyDocumentVersion.findMany({ where: { orgId } });
  const conduct = versions.find((version) => version.title === "Code of Conduct")!;
  conductId = conduct.documentId; conductVersionId = conduct.id;
  refundId = versions.find((version) => version.title === "Refund Policy")!.documentId;
});

test("agreement gating blocks registration until every policy is ticked", async ({ page }) => {
  await details(page, first);
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeDisabled();
  await expect(page.getByRole("status")).toHaveText("Add an emergency contact.");
  await expectNoSeriousAccessibilityViolations(page);
  await fillDetails(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const panel = page.getByRole("region", { name: "Code of Conduct", exact: true });
  await expect(panel.getByRole("heading", { name: "Be kind", level: 4 })).toBeVisible();
  await expect(panel.locator('a[href^="javascript"]')).toHaveCount(0);
  await expect(panel.locator("script")).toHaveCount(0);
  await expect(panel.getByText("<script>bad()</script>", { exact: true })).toBeVisible();
  const cart = page.getByRole("button", { name: "Add to cart", exact: true });
  const submit = page.getByRole("button", { name: "Complete registration", exact: true });
  await expect(cart).toBeDisabled(); await expect(submit).toBeDisabled();
  await page.getByRole("checkbox", { name: "I have read and agree to the Code of Conduct", exact: true }).check();
  await expect(cart).toBeDisabled(); await expect(submit).toBeDisabled();
  await page.getByRole("checkbox", { name: "I have read and agree to the Refund Policy", exact: true }).check();
  await expect(cart).toBeEnabled(); await expect(submit).toBeEnabled();
  await expectNoSeriousAccessibilityViolations(page);
  const registration = await complete(page, first);
  firstRegistrationId = registration.id;
  expect(registration.formResponses).toEqual({ [questionId]: "M" });
  const rows = await agreements(registration.id);
  expect(rows).toHaveLength(2);
  expect(rows.map((row) => row.documentId).sort()).toEqual([conductId, refundId].sort());
  for (const row of rows) {
    expect(row).toMatchObject({ source: "ATTENDEE", portalAccountId: first.id, attestedByUserId: null, version: { version: 1 } });
    expect(row.acceptedAt).toBeInstanceOf(Date);
  }
  expect((await prisma.attendeeProfile.findUniqueOrThrow({ where: { id: first.profileId } })).emergencyContacts)
    .toEqual([{ name: "Emergency Person", country: "VN", phone: "+84812205668" }]);
  await loginAsStaffEmail(page, ownerEmail, { returnTo: `/dashboard/events/${eventId}/registrations/${registration.id}` });
  await expect(page.getByText(/by attendee/)).toHaveCount(2);
  await expect(page.getByText("Emergency Person · +84 812205668", { exact: true })).toBeVisible();
  await expect(page.getByText("M", { exact: true })).toBeVisible();
  const response = await page.request.get(`/dashboard/events/${eventId}/registrations/export`);
  expect(response.ok()).toBe(true);
  const csv = await response.text();
  for (const header of ["T-shirt size", "Code of Conduct version", "Code of Conduct accepted at"]) expect(csv).toContain(header);
  expect(csv).not.toContain("+84812205668");
});

test("a new version applies to new registrations and flags old ones", async ({ page }) => {
  await loginAsStaffEmail(page, ownerEmail, { returnTo: `/dashboard/events/${eventId}/settings/policies/${conductId}` });
  await page.getByRole("textbox", { name: /^Text\b/ }).fill(`${policyBody}\n\nUpdated conduct for version two.`);
  await page.getByRole("button", { name: "Publish version 2", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Version 2 published.");
  conductVersionId = (await prisma.policyDocumentVersion.findUniqueOrThrow({ where: { documentId_version: { documentId: conductId, version: 2 } } })).id;
  await details(page, second); await fillDetails(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await tickPolicies(page);
  secondRegistrationId = (await complete(page, second)).id;
  expect((await agreements(secondRegistrationId)).find((row) => row.documentId === conductId)?.version.version).toBe(2);
  await page.goto(`http://localhost:3000/dashboard/events/${eventId}/registrations/${firstRegistrationId}`);
  await expect(page.getByText(/Code of Conduct — v1 \(current v2\)/)).toBeVisible();
});

test("a policy published while the wizard is open is refused", async ({ page }) => {
  await details(page, stale); await fillDetails(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review registration", exact: true })).toBeVisible();
  conductVersionId = (await prisma.policyDocumentVersion.create({ data: { orgId, documentId: conductId, version: 3,
    title: "Code of Conduct", body: `${policyBody}\n\nVersion three.`, publishedByUserId: ownerId } })).id;
  await tickPolicies(page);
  await page.getByRole("button", { name: "Complete registration", exact: true }).click();
  await expect(page.getByTestId("registration-error")).toContainText("This policy was updated; please review it again.");
  await expect(page.getByRole("button", { name: "Reload page", exact: true })).toBeVisible();
  expect(await prisma.registration.count({ where: { orgId, eventId, portalAccountId: stale.id } })).toBe(0);
});

test("contacts are reused and answers are editable until the event starts", async ({ page }) => {
  await signInAttendee(page, first);
  await page.goto(`${origin}/account/attendees/${first.profileId}`);
  await expect(page.getByLabel(/Contact 1 name/)).toHaveValue("Emergency Person");
  await expect(page.getByLabel(/Contact 1 country/)).toHaveValue("VN");
  await expect(page.getByLabel(/Contact 1 phone/)).toHaveValue("812205668");
  await prisma.registration.update({ where: { id: firstRegistrationId }, data: { status: "CANCELLED" } });
  await details(page, first);
  await expect(page.getByLabel("Contact 1 name", { exact: true })).toHaveValue("Emergency Person");
  await expect(page.getByLabel("Contact 1 phone", { exact: true })).toHaveValue("812205668");
  await signInAttendee(page, second);
  const path = `${origin}/account/registrations/${secondRegistrationId}`;
  await page.goto(path);
  await page.getByRole("link", { name: "Edit answers", exact: true }).click();
  await page.getByRole("combobox", { name: "T-shirt size", exact: true }).selectOption("L");
  await page.getByRole("button", { name: "Save answers", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Answers saved.");
  expect((await prisma.registration.findUniqueOrThrow({ where: { id: secondRegistrationId } })).formResponses).toEqual({ [questionId]: "L" });
  await expectNoSeriousAccessibilityViolations(page);
  await prisma.event.update({ where: { id: eventId }, data: { startDate: new Date(Date.now() - 60_000) } });
  try {
    await page.goto(path);
    await expect(page.getByText("Answers can no longer be changed for this registration.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit answers", exact: true })).toHaveCount(0);
  } finally { await prisma.event.update({ where: { id: eventId }, data: { startDate } }); }
});

test("cashier walk-in records a staff attestation and clears the form", async ({ page }) => {
  await loginAsStaffEmail(page, ownerEmail, { returnTo: `/dashboard/events/${eventId}/check-in/cashier` });
  const attestation = page.getByRole("checkbox", { name: "The attendee has agreed to: Code of Conduct v3, Refund Policy v1", exact: true });
  await expect(attestation).toHaveAttribute("required", "");
  // Keep the same mounted form: identical consecutive success messages must both reset it.
  for (let index = 1; index <= 2; index++) {
    const email = `walk-in-${index}-${runId}@example.com`;
    await page.getByLabel("Attendee name", { exact: true }).fill(`Walk-in ${index}`);
    await page.getByLabel("Attendee email", { exact: true }).fill(email);
    await page.getByRole("combobox", { name: "Registration type", exact: true }).selectOption(typeId);
    await page.getByLabel("Amount collected", { exact: true }).fill("0");
    await expect(attestation).not.toBeChecked();
    await attestation.check();
    await page.getByRole("button", { name: "Complete registration", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Walk-in registration completed.");
    await expect(page.getByLabel("Attendee name", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Attendee email", { exact: true })).toHaveValue("");
    await expect(attestation).not.toBeChecked();
    const registration = await prisma.registration.findFirstOrThrow({ where: { orgId, eventId, portalAccount: { email } } });
    const rows = await agreements(registration.id);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toMatchObject({ source: "STAFF", attestedByUserId: ownerId, portalAccountId: null });
  }
});

test("admin transfer records a staff attestation", async ({ page }) => {
  const before = await agreements(secondRegistrationId);
  expect(before.every((row) => row.source === "ATTENDEE")).toBe(true);
  await loginAsStaffEmail(page, ownerEmail, { returnTo: `/dashboard/events/${eventId}/registrations/transfers` });
  await page.getByRole("combobox", { name: "Source registration", exact: true }).selectOption(secondRegistrationId);
  await page.getByLabel("New attendee name", { exact: true }).fill("Admin recipient");
  await page.getByLabel("New attendee email", { exact: true }).fill(`admin-recipient-${runId}@example.com`);
  const attestation = page.getByRole("checkbox", { name: /^The attendee has agreed to:/ });
  await expect(attestation).toHaveAttribute("required", "");
  await attestation.check();
  await page.getByRole("button", { name: "Transfer registration", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Registration transferred.");
  const received = await prisma.registration.findFirstOrThrow({ where: { orgId, transferredFromId: secondRegistrationId } });
  const rows = await agreements(received.id);
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(row).toMatchObject({ source: "STAFF", attestedByUserId: ownerId, portalAccountId: null });
  expect(await agreements(secondRegistrationId)).toEqual(before);
});

test("a transfer recipient agrees and answers for themselves", async ({ page }) => {
  await details(page, sender); await fillDetails(page, "M", "Sender contact");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await tickPolicies(page);
  const source = await complete(page, sender);
  const before = await agreements(source.id);
  const sourceProfile = await prisma.attendeeProfile.findUniqueOrThrow({ where: { id: sender.profileId } });
  const rawToken = randomBytes(32).toString("base64url");
  const request = await prisma.registrationTransferRequest.create({ data: { orgId, eventId, sourceRegistrationId: source.id,
    requesterUserId: ownerId, recipientEmail: recipient.email, tokenHash: createHash("sha256").update(rawToken).digest("hex"),
    expiresAt: new Date(Date.now() + 3_600_000) } });
  await signInAttendee(page, recipient);
  await page.goto(`${origin}/account/transfers/${request.id}?token=${rawToken}`);
  await expect(page.getByRole("combobox", { name: "T-shirt size", exact: true })).toHaveValue("");
  await expect(page.getByLabel("Contact 1 name", { exact: true })).toHaveValue("");
  await fillDetails(page, "L", "Recipient contact");
  await tickPolicies(page);
  await page.getByRole("button", { name: "Accept transfer", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("notice") === "accepted", { waitUntil: "load" });
  const received = await prisma.registration.findFirstOrThrow({ where: { orgId, transferredFromId: source.id } });
  expect(received.formResponses).toEqual({ [questionId]: "L" });
  const rows = await agreements(received.id);
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(row).toMatchObject({ source: "ATTENDEE", portalAccountId: recipient.id, attestedByUserId: null });
  expect((await prisma.attendeeProfile.findUniqueOrThrow({ where: { id: received.attendeeProfileId } })).emergencyContacts)
    .toEqual([{ name: "Recipient contact", country: "VN", phone: "+84812205668" }]);
  expect(await agreements(source.id)).toEqual(before);
  expect((await prisma.registration.findUniqueOrThrow({ where: { id: source.id } })).formResponses).toEqual(source.formResponses);
  expect(await prisma.attendeeProfile.findUniqueOrThrow({ where: { id: sender.profileId } })).toEqual(sourceProfile);
});

test("policies and agreements stay inside their tenant", async ({ page }) => {
  await loginAsStaffEmail(page, ownerEmail);
  const response = await page.goto(`/dashboard/events/${otherEventId}/settings/policies/${otherDocumentId}`);
  expect(response?.status()).toBe(404);
  const path = `/dashboard/events/${eventId}/settings/policies`;
  await page.goto(path);
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Archive", exact: true }) }).first();
  await submitTamperedAction(page, path, form, "Archive", "documentId", otherDocumentId);
  await expect(page.getByTestId("route-error")).toBeVisible();
  expect((await prisma.policyDocument.findUniqueOrThrow({ where: { id: otherDocumentId } })).archivedAt).toBeNull();
  await signInAttendee(page, first);
  const agreementPage = await page.goto(`${origin}/account/registrations/${firstRegistrationId}/agreements/${otherVersionId}`);
  expect(agreementPage?.status()).toBe(404);
  await expect(prisma.registrationAgreement.create({ data: { orgId, eventId, registrationId: firstRegistrationId,
    documentId: otherDocumentId, documentVersionId: otherVersionId, source: "ATTENDEE", portalAccountId: first.id } })).rejects.toMatchObject({ code: "P2003" });
  expect(await prisma.registrationAgreement.count({ where: { registrationId: firstRegistrationId, documentId: otherDocumentId } })).toBe(0);
});
