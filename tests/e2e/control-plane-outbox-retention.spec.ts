import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const orgSlug = `outbox-retention-${runId}`;
const eventId = randomUUID();

test.afterAll(async () => {
  await prisma.controlPlaneOutboxEvent.deleteMany({ where: { id: eventId } });
  await prisma.organization.deleteMany({ where: { slug: orgSlug } });
  await prisma.$disconnect();
});

test("deleting an organization detaches and preserves its control-plane history", async () => {
  const organization = await prisma.organization.create({
    data: {
      name: "Outbox Retention Fixture",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: `outbox-retention-${runId}@example.com`
    }
  });
  const payload = {
    id: eventId,
    type: "tenant.lifecycle-changed",
    organizationId: organization.id,
    aggregateType: "tenant",
    aggregateId: organization.id,
    occurredAt: new Date().toISOString(),
    actorUserId: null,
    aggregateVersion: 1,
    correlationId: randomUUID(),
    data: { previousStatus: "PROVISIONING", status: "ACTIVE" }
  };
  await prisma.controlPlaneOutboxEvent.create({
    data: {
      id: eventId,
      idempotencyKey: randomUUID(),
      organizationId: organization.id,
      aggregateType: "tenant",
      aggregateId: organization.id,
      eventType: "tenant.lifecycle-changed",
      aggregateVersion: 1,
      correlationId: payload.correlationId,
      actorUserId: null,
      payload
    }
  });

  await expect(prisma.organization.delete({ where: { id: organization.id } })).resolves.toMatchObject({
    id: organization.id
  });
  await expect(prisma.controlPlaneOutboxEvent.findUniqueOrThrow({ where: { id: eventId } })).resolves.toMatchObject({
    organizationId: null,
    aggregateId: organization.id,
    payload: expect.objectContaining({ organizationId: organization.id })
  });
});
