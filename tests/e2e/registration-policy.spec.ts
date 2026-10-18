import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createPortalAccountFixture, loginAsAttendee, portalOrigin } from "./support/portal";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "RegistrationPolicyPass123!";
const ownerEmail = `registration-policy-owner-${runId}@example.com`;
const attendeeEmail = `registration-policy-attendee-${runId}@example.com`;
const orgSlug = `registration-policy-org-${runId}`;
const capOrgSlug = `registration-policy-cap-org-${runId}`;
const approvalEventSlug = "approval-event";
const capEventSlug = "cap-event";

let ownerId: string;
let attendeeId: string;
let capAttendeeId: string;
let approvalEventId: string;
let approvalTierId: string;
let capEventId: string;
let capTierId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: ownerEmail, name: "Registration Policy Owner", ...staffIdentityData() } });
  ownerId = owner.id;

  const org = await prisma.organization.create({
    data: {
      name: "Registration Policy Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: ownerEmail,
      status: "ACTIVE",
      members: { create: { userId: owner.id, role: "OWNER" } },
      events: {
        create: {
          name: "Approval Event",
          slug: approvalEventSlug,
          status: "PUBLISHED",
          startDate: new Date("2028-03-01T09:00:00Z"),
          endDate: new Date("2028-03-02T17:00:00Z"),
          settings: { requireApproval: true, allowTransfers: false, maxRegistrationsPerUser: 1 }
        }
      }
    },
    include: { events: true }
  });

  const approvalEvent = org.events[0]!;
  approvalEventId = approvalEvent.id;

  const attendee = await createPortalAccountFixture(prisma, { orgId: org.id, email: attendeeEmail, name: "Registration Policy Attendee", password });
  attendeeId = attendee.id;

  const capOrg = await prisma.organization.create({
    data: {
      name: "Registration Capacity Organization",
      slug: capOrgSlug,
      subdomain: capOrgSlug,
      contactEmail: ownerEmail,
      status: "ACTIVE",
      members: { create: { userId: owner.id, role: "OWNER" } },
      events: {
        create: {
          name: "Capacity Event",
          slug: capEventSlug,
          status: "PUBLISHED",
          startDate: new Date("2028-04-01T09:00:00Z"),
          endDate: new Date("2028-04-02T17:00:00Z"),
          settings: { requireApproval: false, allowTransfers: true, maxRegistrationsPerUser: 1 }
        }
      }
    },
    include: { events: true }
  });
  capEventId = capOrg.events[0]!.id;
  capAttendeeId = (await createPortalAccountFixture(prisma, { orgId: capOrg.id, email: attendeeEmail, name: "Registration Policy Attendee", password })).id;

  const [approvalTier, capTier] = await Promise.all([
    prisma.registrationType.create({ data: { orgId: org.id, eventId: approvalEvent.id, name: "Approval Ticket", price: 0 } }),
    prisma.registrationType.create({ data: { orgId: capOrg.id, eventId: capEventId, name: "Capacity Ticket", price: 0 } })
  ]);
  approvalTierId = approvalTier.id;
  capTierId = capTier.id;
});

test.afterAll(async () => {
  await prisma.organization.deleteMany({ where: { slug: { in: [orgSlug, capOrgSlug] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId].filter(Boolean) } } });
  await prisma.$disconnect();
});

async function login(page: Page, email: string) {
  if (email === attendeeEmail) {
    await loginAsAttendee(page, { subdomain: orgSlug }, email, { password });
  } else {
    await loginAsStaffEmail(page, email);
  }
}

async function prepareRegistration(page: Page, targetOrgSlug: string) {
  await page.goto(`${portalOrigin(targetOrgSlug)}/register`);
  await expect(page.getByRole("heading", { name: "Registration" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Review" }).click();
  await expect(page.getByRole("heading", { name: "Review registration" })).toBeVisible();
  return page;
}

async function submitRegistration(page: Page) {
  await page.getByRole("button", { name: "Complete registration" }).click({ noWaitAfter: true });
  await page.waitForTimeout(1_500);
}

test("required approval remains separate from paid registration status", async ({ page }) => {
  await login(page, attendeeEmail);
  await prepareRegistration(page, orgSlug);
  await submitRegistration(page);

  const created = await prisma.registration.findFirstOrThrow({ where: { eventId: approvalEventId, portalAccountId: attendeeId } });
  expect(created.status).toBe("CONFIRMED");
  expect(created.approvalStatus).toBe("PENDING");

  await login(page, ownerEmail);
  await page.goto(`/dashboard/events/${approvalEventId}/check-in?q=${encodeURIComponent(attendeeEmail)}`);
  await expect(page.getByRole("button", { name: "Approval required" })).toBeDisabled();
  await page.goto(`/dashboard/events/${approvalEventId}/registrations/${created.id}`);
  await page.getByRole("button", { name: "Approve registration" }).click({ noWaitAfter: true });
  await expect.poll(async () => (await prisma.registration.findUniqueOrThrow({ where: { id: created.id } })).approvalStatus).toBe("APPROVED");
  expect((await prisma.registration.findUniqueOrThrow({ where: { id: created.id } })).status).toBe("CONFIRMED");
  await page.goto(`/dashboard/events/${approvalEventId}/check-in?q=${created.id}`);
  await expect(page.getByRole("button", { name: "Check in" })).toBeEnabled();
});

test("the per-account cap survives concurrent submissions", async ({ browser }) => {
  const contexts: BrowserContext[] = [await browser.newContext(), await browser.newContext()];
  const pages = await Promise.all(contexts.map((context) => context.newPage()));

  try {
    await Promise.all(pages.map((page) => loginAsAttendee(page, { subdomain: capOrgSlug }, attendeeEmail, { password })));
    await Promise.all(pages.map((page) => prepareRegistration(page, capOrgSlug)));
    await Promise.all(pages.map((page) => submitRegistration(page).catch(() => undefined)));

    await expect.poll(async () => prisma.registration.count({ where: { eventId: capEventId, portalAccountId: capAttendeeId, status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] } } })).toBe(1);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});

test("disabled transfers are rejected by the server policy", async ({ page }) => {
  const registration = await prisma.registration.findFirstOrThrow({ where: { eventId: approvalEventId, portalAccountId: attendeeId } });
  await login(page, ownerEmail);
  await prisma.event.update({
    where: { id: approvalEventId },
    data: { settings: { requireApproval: true, allowTransfers: true, maxRegistrationsPerUser: 1 } }
  });
  await page.goto(`/dashboard/events/${approvalEventId}/registrations/transfers`);
  const requestForm = page.locator("form").filter({ hasText: "Request transfer" });
  await expect(requestForm).toBeVisible();
  await prisma.event.update({
    where: { id: approvalEventId },
    data: { settings: { requireApproval: true, allowTransfers: false, maxRegistrationsPerUser: 1 } }
  });
  await requestForm.getByLabel("Recipient email").fill(`blocked-recipient-${runId}@example.com`);
  await requestForm.getByRole("button", { name: "Send transfer email" }).click({ noWaitAfter: true });
  await page.waitForTimeout(1_000);

  const unchanged = await prisma.registration.findUniqueOrThrow({ where: { id: registration.id } });
  expect(unchanged.status).toBe("CONFIRMED");
  expect(await prisma.registration.count({ where: { eventId: approvalEventId } })).toBe(1);
  await page.goto(`/dashboard/events/${approvalEventId}/registrations/transfers`);
  await expect(page.getByRole("heading", { name: "Transfers disabled" })).toBeVisible();
});
