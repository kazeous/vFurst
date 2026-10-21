import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { attendeeProfileFixture } from "./support/portal";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const orgIds: string[] = [];
let requesterUserId: string;
type TenantFixture = { orgId: string; eventId: string; typeId: string; portalAccountId: string; attendeeProfileId: string };
let tenantA: TenantFixture;
let tenantB: TenantFixture;

test.describe.serial("portal ownership integrity", () => {
  test.beforeAll(async () => {
    const fixtures: TenantFixture[] = [];
    for (const tenant of ["a", "b"]) {
      const slug = `portal-ownership-${tenant}-${runId}`;
      const organization = await prisma.organization.create({
        data: { name: `Portal Ownership ${tenant}`, slug, subdomain: slug, contactEmail: `${slug}@example.com` }
      });
      orgIds.push(organization.id);
      const event = await prisma.event.create({
        data: {
          orgId: organization.id,
          name: "Ownership Event",
          slug: "ownership-event",
          startDate: new Date("2027-01-01T00:00:00Z"),
          endDate: new Date("2027-01-02T00:00:00Z")
        }
      });
      const registrationType = await prisma.registrationType.create({
        data: { orgId: organization.id, eventId: event.id, name: "Standard", price: 0 }
      });
      const account = await prisma.portalAccount.create({
        data: { orgId: organization.id, email: `attendee-${runId}@example.com` }
      });
      const profile = await attendeeProfileFixture(prisma, { orgId: organization.id, portalAccountId: account.id, fullName: account.email });
      fixtures.push({ orgId: organization.id, eventId: event.id, typeId: registrationType.id, portalAccountId: account.id, attendeeProfileId: profile.id });
    }
    [tenantA, tenantB] = fixtures;
    const requester = await prisma.user.create({ data: { email: `ownership-staff-${runId}@example.com` } });
    requesterUserId = requester.id;
  });

  test.afterAll(async () => {
    try {
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      if (requesterUserId) await prisma.user.delete({ where: { id: requesterUserId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test("a registration that points at another organization's portal account is rejected", async () => {
    await expect(prisma.registration.create({
      data: { ...tenantB, portalAccountId: tenantA.portalAccountId, attendeeProfileId: tenantA.attendeeProfileId }
    })).rejects.toMatchObject({ code: "P2003" });
  });

  test("the composite key rejects a registration whose profile belongs to another account", async () => {
    const account = await prisma.portalAccount.create({ data: { orgId: tenantA.orgId, email: `other-profile-${runId}@example.com` } });
    try {
      const profile = await attendeeProfileFixture(prisma, { orgId: tenantA.orgId, portalAccountId: account.id, fullName: "Other Account Attendee" });
      await expect(prisma.registration.create({ data: { ...tenantA, attendeeProfileId: profile.id } })).rejects.toMatchObject({ code: "P2003" });
    } finally {
      await prisma.portalAccount.delete({ where: { id: account.id } });
    }
  });

  test("an order that points at another organization's portal account is rejected", async () => {
    await expect(prisma.order.create({
      data: {
        orgId: tenantB.orgId,
        eventId: tenantB.eventId,
        portalAccountId: tenantA.portalAccountId,
        total: 0,
        platformFee: 0
      }
    })).rejects.toMatchObject({ code: "P2003" });
  });

  test("a transfer recipient from another organization is rejected", async () => {
    const registration = await prisma.registration.create({ data: tenantB });
    await expect(prisma.registrationTransferRequest.create({
      data: {
        orgId: tenantB.orgId,
        eventId: tenantB.eventId,
        sourceRegistrationId: registration.id,
        requesterUserId,
        recipientEmail: `attendee-${runId}@example.com`,
        recipientAccountId: tenantA.portalAccountId,
        tokenHash: randomBytes(32).toString("hex"),
        expiresAt: new Date(Date.now() + 3_600_000)
      }
    })).rejects.toMatchObject({ code: "P2003" });
  });

  test("a portal session for another organization's account is rejected", async () => {
    await expect(prisma.portalSession.create({
      data: {
        orgId: tenantB.orgId,
        portalAccountId: tenantA.portalAccountId,
        tokenHash: randomBytes(32).toString("hex"),
        authVersion: 0,
        expiresAt: new Date(Date.now() + 3_600_000)
      }
    })).rejects.toMatchObject({ code: "P2003" });
  });

  test("deleting an organization cascades through portal-owned registrations, orders, carts, and accepted transfers", async () => {
    const registration = await prisma.registration.create({ data: tenantA });
    const cart = await prisma.cart.create({
      data: { orgId: tenantA.orgId, eventId: tenantA.eventId, portalAccountId: tenantA.portalAccountId }
    });
    await prisma.order.create({
      data: {
        orgId: tenantA.orgId,
        eventId: tenantA.eventId,
        portalAccountId: tenantA.portalAccountId,
        cartId: cart.id,
        total: 0,
        platformFee: 0
      }
    });
    await prisma.registrationTransferRequest.create({
      data: {
        orgId: tenantA.orgId,
        eventId: tenantA.eventId,
        sourceRegistrationId: registration.id,
        requesterUserId,
        recipientEmail: `attendee-${runId}@example.com`,
        recipientAccountId: tenantA.portalAccountId,
        tokenHash: randomBytes(32).toString("hex"),
        status: "ACCEPTED",
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 3_600_000)
      }
    });
    const where = { orgId: tenantA.orgId };
    const counts = () => Promise.all([
      prisma.portalAccount.count({ where }),
      prisma.registration.count({ where }),
      prisma.order.count({ where }),
      prisma.cart.count({ where }),
      prisma.registrationTransferRequest.count({ where })
    ]);
    expect(await counts()).toEqual([1, 1, 1, 1, 1]);
    await expect(prisma.organization.delete({ where: { id: tenantA.orgId } })).resolves.toMatchObject({ id: tenantA.orgId });
    expect(await counts()).toEqual([0, 0, 0, 0, 0]);
    await expect(prisma.user.findUniqueOrThrow({ where: { id: requesterUserId } })).resolves.toMatchObject({ id: requesterUserId });
  });
});
