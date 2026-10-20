import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { attendeeProfileFixture, createPortalAccountFixture, loginAsAttendee, portalOrigin } from "./support/portal";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const slug = `profile-auth-${runId}`;
const origin = portalOrigin(slug);
const otherSlug = `${slug}-b`;
const ownerEmail = `profile-owner-${runId}@example.com`;
const rawKey = `vf_test_${randomUUID()}`;
const privateEmail = `private-profile-${runId}@example.com`;
const privatePhone = "0901234567";
const orgIds: string[] = [];
let ownerId: string, orgId: string, otherOrgId: string, eventId: string, registrationId: string;
let mine: { id: string; email: string }, ownProfileId: string;
const foreignIds: string[] = [];

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  ownerId = (await prisma.user.create({ data: { email: ownerEmail, ...staffIdentityData() } })).id;
  for (const subdomain of [slug, otherSlug]) {
    const org = await prisma.organization.create({ data: { slug: subdomain, subdomain, name: subdomain, status: "ACTIVE", contactEmail: ownerEmail,
      ...(subdomain === slug ? { members: { create: { userId: ownerId, role: "OWNER" } } } : {}) } });
    orgIds.push(org.id);
  }
  [orgId, otherOrgId] = orgIds;
  const event = await prisma.event.create({ data: { orgId, name: "Profile Authorization Event", slug: "profiles", status: "PUBLISHED",
    startDate: new Date("2028-05-01T00:00:00Z"), endDate: new Date("2028-05-02T00:00:00Z") } });
  eventId = event.id;
  const type = await prisma.registrationType.create({ data: { orgId, eventId, name: "Free authorization ticket", price: 0 } });
  mine = await createPortalAccountFixture(prisma, { orgId, email: `profile-mine-${runId}@example.com`, name: "Own Free Attendee" });
  ownProfileId = (await attendeeProfileFixture(prisma, { orgId, portalAccountId: mine.id, fullName: "Own Free Attendee" })).id;
  for (const [index, targetOrg] of [orgId, otherOrgId].entries()) {
    const account = await createPortalAccountFixture(prisma, { orgId: targetOrg, email: `profile-foreign-${index}-${runId}@example.com`, name: `Foreign Attendee ${index}` });
    foreignIds.push((await attendeeProfileFixture(prisma, { orgId: targetOrg, portalAccountId: account.id, fullName: `Foreign Attendee ${index}` })).id);
  }
  const exported = await prisma.attendeeProfile.create({ data: { orgId, portalAccountId: mine.id, fullName: "Exported Attendee", badgeName: "Export Badge",
    dateOfBirth: new Date("2010-05-01T00:00:00Z"), email: privateEmail, phone: privatePhone } });
  registrationId = (await prisma.registration.create({ data: { orgId, eventId, portalAccountId: mine.id, attendeeProfileId: exported.id,
    typeId: type.id, status: "CONFIRMED", approvalStatus: "APPROVED" } })).id;
  await prisma.apiKey.create({ data: { orgId, name: "Profile minimization", keyHash: createHash("sha256").update(rawKey).digest("hex"), scopes: ["read:registrations"] } });
});

test.afterAll(async () => {
  try {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  } finally { await prisma.$disconnect(); }
});

test("an account cannot load another account's or another organization's profile edit page", async ({ page }) => {
  await loginAsAttendee(page, { subdomain: slug }, mine.email);
  for (const id of foreignIds) {
    await page.goto(`${origin}/account/attendees/${id}`);
    await expect(page.getByText(/could not be found/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Edit attendee", exact: true })).toHaveCount(0);
  }
});

test("forged update and delete posts reveal nothing and leave foreign profiles unchanged", async ({ page }) => {
  await loginAsAttendee(page, { subdomain: slug }, mine.email);
  for (const id of foreignIds) {
    const before = await prisma.attendeeProfile.findUniqueOrThrow({ where: { id } });
    for (const button of ["Save attendee", "Delete"]) {
      await page.goto(`${origin}/account/attendees/${ownProfileId}`);
      const form = page.locator("form").filter({ has: page.getByRole("button", { name: button, exact: true }) });
      await form.locator('input[name="profileId"]').evaluate((node, target) => { (node as HTMLInputElement).value = target; }, id);
      await form.getByRole("button", { name: button, exact: true }).click();
      await expect(form.getByRole("alert")).toHaveText("Attendee not found.");
      expect(await prisma.attendeeProfile.findUniqueOrThrow({ where: { id } })).toEqual(before);
    }
  }
  expect(await prisma.attendeeProfile.count({ where: { id: ownProfileId, portalAccountId: mine.id } })).toBe(1);
});

test("Org B's attendee endpoint rejects Org A's portal cookie", async ({ page, request }) => {
  await loginAsAttendee(page, { subdomain: slug }, mine.email);
  const cookies = await page.context().cookies(origin);
  expect(cookies.length).toBeGreaterThan(0);
  const response = await request.get(`/api/portal/attendees?eventId=${eventId}`, {
    headers: { host: `${otherSlug}.localhost:3000`, cookie: cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ") }
  });
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ account: null, attendees: null });
});

test("a tampered foreign attendee selection is rejected inline", async ({ page }) => {
  await loginAsAttendee(page, { subdomain: slug }, mine.email);
  for (const id of foreignIds) {
    await page.goto(`${origin}/register`);
    await expect(page.locator('[data-registration-ready="true"]')).toBeVisible();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("radio", { name: /Own Free Attendee/ })).toBeChecked();
    await page.getByRole("button", { name: "Review", exact: true }).click();
    await page.locator('input[name="attendeeProfileId"]').evaluate((node, target) => { (node as HTMLInputElement).value = target; }, id);
    await page.getByRole("button", { name: "Complete registration", exact: true }).click();
    await expect(page.getByTestId("registration-error")).toHaveText("That attendee is not available.");
  }
  expect(await prisma.registration.count({ where: { orgId, portalAccountId: mine.id } })).toBe(1);
});

test("API v1 and both exports omit profile DOB and contact details", async ({ page, request }) => {
  for (const path of [`/api/v1/registrations?eventId=${eventId}`, `/api/v1/registrations/${registrationId}`]) {
    const response = await request.get(path, { headers: { authorization: `Bearer ${rawKey}` } });
    expect(response.status()).toBe(200);
    const body = await response.json();
    const row = Array.isArray(body.data) ? body.data[0] : body.data ?? body;
    expect(Object.keys(row.attendee).sort()).toEqual(["badgeName", "fullName", "id"]);
    expect(row.user.email).toBe(mine.email);
    expect(JSON.stringify(body)).not.toContain("dateOfBirth");
    expect(JSON.stringify(body)).not.toContain(privateEmail);
    expect(JSON.stringify(body)).not.toContain(privatePhone);
  }
  await loginAsStaffEmail(page, ownerEmail);
  for (const surface of ["registrations", "analytics"]) {
    const response = await page.request.get(`/dashboard/events/${eventId}/${surface}/export`);
    expect(response.status()).toBe(200);
    const csv = await response.text();
    expect(csv).toContain("Exported Attendee"); expect(csv).toContain("Export Badge"); expect(csv).toContain(mine.email);
    for (const forbidden of ["dateOfBirth", "2010-05-01", privateEmail, privatePhone]) expect(csv).not.toContain(forbidden);
  }
});
