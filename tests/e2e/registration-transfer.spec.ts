import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { attendeeProfileFixture, createPortalAccountFixture, loginAsAttendee, portalOrigin } from "./support/portal";
import { staffIdentityData } from "./support/staff";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "RegistrationTransferPass123!";
const ownerEmail = `transfer-owner-${runId}@example.com`;
const sourceEmail = `transfer-source-${runId}@example.com`;
const recipientEmail = `transfer-recipient-${runId}@example.com`;
const wrongEmail = `transfer-wrong-${runId}@example.com`;
const orgSlug = `transfer-org-${runId}`;

let ownerId: string;
let sourceAccountId: string;
let recipientAccountId: string;
let wrongAccountId: string;
let orgId: string;
let eventId: string;
let typeId: string;
let addOnDefinitionId: string;
let badgeTemplateId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: ownerEmail, name: "Transfer Owner", ...staffIdentityData() } });
  ownerId = owner.id;

  const org = await prisma.organization.create({
    data: {
      name: "Registration Transfer Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: ownerEmail,
      status: "ACTIVE",
      members: { create: { userId: owner.id, role: "OWNER" } },
      events: {
        create: {
          name: "Registration Transfer Event",
          slug: "transfer-event",
          status: "PUBLISHED",
          startDate: new Date("2028-05-01T09:00:00Z"),
          endDate: new Date("2028-05-02T17:00:00Z"),
          settings: { requireApproval: false, allowTransfers: true, maxRegistrationsPerUser: 4 }
        }
      }
    },
    include: { events: true }
  });
  orgId = org.id;
  eventId = org.events[0]!.id;

  const source = await createPortalAccountFixture(prisma, { orgId: org.id, email: sourceEmail, name: "Source Attendee", password });
  const recipient = await createPortalAccountFixture(prisma, { orgId: org.id, email: recipientEmail, name: "Recipient Attendee", password });
  const wrong = await createPortalAccountFixture(prisma, { orgId: org.id, email: wrongEmail, name: "Wrong Recipient", password });
  sourceAccountId = source.id;
  recipientAccountId = recipient.id;
  wrongAccountId = wrong.id;

  const type = await prisma.registrationType.create({
    data: { orgId, eventId, name: "Transfer Ticket", price: 5000 }
  });
  typeId = type.id;
  const addOn = await prisma.addOnDefinition.create({
    data: { orgId, registrationTypeId: typeId, name: "Transfer Add-on", price: 1000 }
  });
  addOnDefinitionId = addOn.id;
  const template = await prisma.badgeTemplate.create({
    data: { orgId, eventId, name: "Transfer Badge", layout: { elements: [] }, dimensions: { width: 300, height: 180 } }
  });
  badgeTemplateId = template.id;
});

test.afterAll(async () => {
  // Ids stay unset when beforeAll fails early, and Prisma drops an undefined filter, matching every row.
  if (orgId) await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: { in: [ownerId].filter(Boolean) } } });
  await prisma.$disconnect();
});

async function login(page: Page, email: string) {
  await loginAsAttendee(page, { subdomain: orgSlug }, email, { password });
}

async function createTransferRequest(input: { recipient: string; expiresAt?: Date; withArtifacts?: boolean }) {
  const suffix = randomBytes(6).toString("hex");
  const rawToken = randomBytes(32).toString("base64url");
  const activeCount = await prisma.registration.count({
    where: { orgId, eventId, portalAccountId: sourceAccountId, status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] } }
  });
  const profile = await attendeeProfileFixture(prisma, {
    orgId, portalAccountId: sourceAccountId, fullName: "Source Attendee", accountHolder: activeCount === 0
  });
  const source = await prisma.registration.create({
    data: {
      orgId,
      eventId,
      portalAccountId: sourceAccountId,
      attendeeProfileId: profile.id,
      typeId,
      status: "CONFIRMED",
      approvalStatus: "APPROVED",
      badgeNumber: `TR-${suffix}`,
      addOns: {
        create: { orgId, addOnDefinitionId, price: 1000, quantity: 1 }
      },
      badges: input.withArtifacts
        ? {
            create: {
              orgId,
              templateId: badgeTemplateId,
              barcodeData: `OLD-${suffix}`,
              nfcTag: `NFC-${suffix}`,
              pdfUrl: `data:application/pdf;base64,${suffix}`,
              zplData: `^XA${suffix}^XZ`,
              generatedAt: new Date(),
              printedAt: new Date()
            }
          }
        : undefined
    }
  });
  const request = await prisma.registrationTransferRequest.create({
    data: {
      orgId,
      eventId,
      sourceRegistrationId: source.id,
      requesterUserId: ownerId,
      recipientEmail: input.recipient.toLowerCase(),
      tokenHash: createHash("sha256").update(rawToken).digest("hex"),
      expiresAt: input.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000)
    }
  });
  return { request, rawToken, source };
}

test("recipient accepts once and ownership, add-ons, and invalidated badge move atomically", async ({ page }) => {
  const created = await createTransferRequest({ recipient: recipientEmail, withArtifacts: true });
  await login(page, recipientEmail);
  await page.goto(`${portalOrigin(orgSlug)}/account/transfers/${created.request.id}?token=${created.rawToken}`);
  await expect(page.getByRole("heading", { name: "Registration Transfer Event", level: 2 })).toBeVisible();
  const acceptedNavigation = page.waitForURL((url) => url.searchParams.get("notice") === "accepted", { waitUntil: "load" });
  await page.getByRole("button", { name: "Accept transfer" }).click({ noWaitAfter: true });
  await acceptedNavigation;

  await expect.poll(async () => (await prisma.registrationTransferRequest.findUniqueOrThrow({ where: { id: created.request.id } })).status).toBe("ACCEPTED");
  const source = await prisma.registration.findUniqueOrThrow({ where: { id: created.source.id } });
  const received = await prisma.registration.findFirstOrThrow({
    where: { transferredFromId: source.id },
    include: { addOns: true, badges: true }
  });
  expect(source.status).toBe("TRANSFERRED");
  expect(source.badgeNumber).toBeNull();
  expect(received.portalAccountId).toBe(recipientAccountId);
  expect(received.status).toBe("CONFIRMED");
  expect(received.badgeNumber).toBe(created.source.badgeNumber);
  expect(received.addOns).toHaveLength(1);
  expect(received.badges).toHaveLength(1);
  expect(received.badges[0]!.barcodeData).not.toContain("OLD-");
  expect(received.badges[0]!.nfcTag).toBeNull();
  expect(received.badges[0]!.printedAt).toBeNull();

  await page.goto(`${portalOrigin(orgSlug)}/account/transfers/${created.request.id}?token=${created.rawToken}`);
  await expect(page.getByRole("button", { name: "Accept transfer" })).toHaveCount(0);
  await expect(page.getByText("This invitation can no longer be used.")).toBeVisible();
  expect(await prisma.registration.count({ where: { transferredFromId: source.id } })).toBe(1);
});

test("an account with a different normalized email cannot inspect or consume the invitation", async ({ page }) => {
  const created = await createTransferRequest({ recipient: recipientEmail });
  await login(page, wrongEmail);
  await page.goto(`${portalOrigin(orgSlug)}/account/transfers/${created.request.id}?token=${created.rawToken}`);
  await expect(page.getByText(/could not be found/i)).toBeVisible();
  const request = await prisma.registrationTransferRequest.findUniqueOrThrow({ where: { id: created.request.id } });
  expect(request.status).toBe("PENDING");
  expect(request.recipientAccountId).toBeNull();
  expect((await prisma.registration.findUniqueOrThrow({ where: { id: created.source.id } })).status).toBe("CONFIRMED");
});

test("recipient can decline without changing registration ownership", async ({ page }) => {
  const created = await createTransferRequest({ recipient: recipientEmail });
  await login(page, recipientEmail);
  await page.goto(`${portalOrigin(orgSlug)}/account/transfers/${created.request.id}?token=${created.rawToken}`);
  const declinedNavigation = page.waitForURL((url) => url.searchParams.get("notice") === "declined", { waitUntil: "load" });
  await page.getByRole("button", { name: "Decline transfer" }).click({ noWaitAfter: true });
  await declinedNavigation;

  await expect.poll(async () => (await prisma.registrationTransferRequest.findUniqueOrThrow({ where: { id: created.request.id } })).status).toBe("DECLINED");
  const request = await prisma.registrationTransferRequest.findUniqueOrThrow({ where: { id: created.request.id } });
  expect(request.recipientAccountId).toBe(recipientAccountId);
  expect(request.declinedAt).not.toBeNull();
  expect((await prisma.registration.findUniqueOrThrow({ where: { id: created.source.id } })).status).toBe("CONFIRMED");
  expect(await prisma.registration.count({ where: { transferredFromId: created.source.id } })).toBe(0);
});

test("expired invitations are persisted as expired and expose no decision controls", async ({ page }) => {
  const created = await createTransferRequest({ recipient: recipientEmail, expiresAt: new Date(Date.now() - 1000) });
  await login(page, recipientEmail);
  await page.goto(`${portalOrigin(orgSlug)}/account/transfers/${created.request.id}?token=${created.rawToken}`);

  await expect(page.getByText("EXPIRED", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept transfer" })).toHaveCount(0);
  await expect.poll(async () => (await prisma.registrationTransferRequest.findUniqueOrThrow({ where: { id: created.request.id } })).status).toBe("EXPIRED");
  expect((await prisma.registration.findUniqueOrThrow({ where: { id: created.source.id } })).status).toBe("CONFIRMED");
});
