import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encryptEmailDeliveryPayload } from "@vfurst/email";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "EmailOperationsPass123!";
const platformEmail = `email-ops-platform-${runId}@example.com`;
const ownerEmail = `email-ops-owner-${runId}@example.com`;
const recipientEmail = `email-ops-recipient-${runId}@example.com`;
const orgSlug = `email-ops-org-${runId}`;
const neighborOrgSlug = `email-ops-neighbor-${runId}`;
// Delivery rows show their last error, so these identify this run's rows on the platform-wide list.
const replayableFailure = `Provider timed out for run ${runId}.`;
const singleUseFailure = `Provider rejected credentials for run ${runId}.`;
const encryptionKey = process.env.EMAIL_DELIVERY_ENCRYPTION_KEY ?? "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

let orgId: string;
let neighborOrgId: string;
let eventId: string;
let originalDeliveryId: string;
let singleUseDeliveryId: string;
let unrelatedDeliveryIds: string[] = [];

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);
test.use({ serviceWorkers: "block" });

async function loginAs(page: Page, email: string, returnTo: string) {
  await loginAsStaffEmail(page, email, { returnTo });
}

test.beforeAll(async () => {
  const [platformAdmin, owner] = await Promise.all([
    prisma.user.create({
      data: { email: platformEmail, name: "Email Operations Admin", ...staffIdentityData(), platformRole: "PLATFORM_ADMIN" }
    }),
    prisma.user.create({ data: { email: ownerEmail, name: "Email Operations Owner", ...staffIdentityData() } })
  ]);
  const org = await prisma.organization.create({
    data: {
      name: "Email Operations Organization",
      slug: orgSlug,
      subdomain: orgSlug,
      contactEmail: ownerEmail,
      status: "ACTIVE",
      members: { create: { userId: owner.id, role: "OWNER" } },
      events: {
        create: {
          name: "Email Operations Event",
          slug: "email-operations-event",
          status: "PUBLISHED",
          startDate: new Date("2028-08-01T09:00:00Z"),
          endDate: new Date("2028-08-02T17:00:00Z")
        }
      }
    },
    include: { events: true }
  });
  orgId = org.id;
  eventId = org.events[0]!.id;

  const encrypted = encryptEmailDeliveryPayload(
    {
      to: recipientEmail,
      template: "staff-message",
      data: {
        eventName: "Email Operations Event",
        subject: `Replay proof ${runId}`,
        message: "This replay-safe operator message should be delivered."
      }
    },
    encryptionKey
  );
  const original = await prisma.emailDelivery.create({
    data: {
      orgId,
      eventId,
      recipient: recipientEmail,
      template: "staff-message",
      status: "DEAD_LETTERED",
      deadLetteredAt: new Date(),
      lastErrorCode: "ETIMEDOUT",
      lastErrorMessage: replayableFailure,
      replayable: true,
      payloadVersion: encrypted.payloadVersion,
      payloadCiphertext: Uint8Array.from(encrypted.payloadCiphertext),
      payloadIv: Uint8Array.from(encrypted.payloadIv),
      payloadAuthTag: Uint8Array.from(encrypted.payloadAuthTag)
    }
  });
  originalDeliveryId = original.id;
  singleUseDeliveryId = (
    await prisma.emailDelivery.create({
      data: {
        recipient: platformEmail,
        template: "password-reset",
        status: "DEAD_LETTERED",
        deadLetteredAt: new Date(),
        lastErrorCode: "EAUTH",
        lastErrorMessage: singleUseFailure,
        replayable: false
      }
    })
  ).id;

  // The platform list is platform-wide. Shared databases hold other tenants' dead letters and
  // orphans whose organization was deleted before the worker ran, so seed one of each.
  neighborOrgId = (
    await prisma.organization.create({
      data: {
        name: "Email Operations Neighbor",
        slug: neighborOrgSlug,
        subdomain: neighborOrgSlug,
        contactEmail: ownerEmail,
        status: "ACTIVE"
      }
    })
  ).id;
  const neighborRecipient = `email-ops-neighbor-${runId}@example.com`;
  const neighborPayload = encryptEmailDeliveryPayload(
    {
      to: neighborRecipient,
      template: "staff-message",
      data: { eventName: "Email Operations Neighbor", subject: "Neighbor message", message: "Another tenant's message." }
    },
    encryptionKey
  );
  unrelatedDeliveryIds = (
    await Promise.all([
      prisma.emailDelivery.create({
        data: {
          orgId: neighborOrgId,
          recipient: neighborRecipient,
          template: "staff-message",
          status: "DEAD_LETTERED",
          deadLetteredAt: new Date(),
          lastErrorCode: "ETIMEDOUT",
          lastErrorMessage: "Provider timed out.",
          replayable: true,
          payloadVersion: neighborPayload.payloadVersion,
          payloadCiphertext: Uint8Array.from(neighborPayload.payloadCiphertext),
          payloadIv: Uint8Array.from(neighborPayload.payloadIv),
          payloadAuthTag: Uint8Array.from(neighborPayload.payloadAuthTag)
        }
      }),
      prisma.emailDelivery.create({
        data: {
          recipient: `email-ops-orphan-${runId}@example.com`,
          template: "organization-invitation",
          status: "DEAD_LETTERED",
          deadLetteredAt: new Date(),
          lastErrorCode: "MISSING_DELIVERY_SCOPE",
          lastErrorMessage: "Organization email delivery no longer has a tenant context.",
          replayable: false
        }
      })
    ])
  ).map((delivery) => delivery.id);
});

test.afterAll(async () => {
  await prisma.emailDelivery.deleteMany({
    where: {
      OR: [
        { orgId },
        { orgId: neighborOrgId },
        { id: singleUseDeliveryId },
        { id: { in: unrelatedDeliveryIds } }
      ]
    }
  });
  // Inside OR an unset id matches nothing; a bare `where: { id: undefined }` would match every organization.
  await prisma.organization.deleteMany({ where: { OR: [{ id: orgId }, { id: neighborOrgId }] } });
  await prisma.user.deleteMany({ where: { email: { in: [platformEmail, ownerEmail] } } });
  await prisma.$disconnect();
});

test("platform operators can inspect and replay safe dead letters without seeing raw payloads", async ({ page }) => {
  await loginAs(page, platformEmail, "/platform/operations/email");

  await expect(page.getByRole("heading", { name: "Email delivery" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Email operations" })).toBeVisible();
  const deliveryRows = page.locator(".vf-table-row");
  const originalRow = deliveryRows.filter({ hasText: replayableFailure });
  await expect(originalRow.getByText(`${recipientEmail.slice(0, 1)}***@${recipientEmail.split("@")[1]}`)).toBeVisible();
  await expect(page.getByText(recipientEmail, { exact: true })).toHaveCount(0);
  await expect(deliveryRows.filter({ hasText: singleUseFailure }).getByText("Single-use content")).toBeVisible();

  await originalRow.getByRole("button", { name: "Replay" }).click();

  await expect.poll(async () => {
    const replay = await prisma.emailDelivery.findFirst({
      where: { replayedFromId: originalDeliveryId, replayedBy: { email: platformEmail } },
      select: { status: true }
    });
    return replay?.status;
  }, { timeout: 30_000 }).toBe("DELIVERED");

  expect((await prisma.emailDelivery.findUniqueOrThrow({ where: { id: originalDeliveryId } })).status).toBe("DEAD_LETTERED");
});

test("event organizers see tenant-scoped delivery history and can replay the retained original", async ({ page }) => {
  const returnTo = `/dashboard/events/${eventId}/settings/emails`;
  await loginAs(page, ownerEmail, returnTo);

  await expect(page.getByRole("heading", { name: "Delivery operations" })).toBeVisible();
  const originalRow = page.locator(".vf-table-row").filter({ hasText: "staff-message" }).filter({ hasText: "dead lettered" });
  await originalRow.getByRole("button", { name: "Replay" }).click();

  await expect.poll(async () => {
    return prisma.emailDelivery.count({
      where: { replayedFromId: originalDeliveryId, replayedBy: { email: ownerEmail }, status: "DELIVERED" }
    });
  }, { timeout: 30_000 }).toBe(1);
});

test("a replay race renders inline instead of throwing an operations page error", async ({ page }) => {
  await loginAs(page, platformEmail, "/platform/operations/email");
  const originalRow = page.locator(".vf-table-row").filter({ hasText: replayableFailure });

  const activeReplay = await prisma.emailDelivery.create({
    data: {
      orgId,
      eventId,
      recipient: recipientEmail,
      template: "staff-message",
      status: "PROCESSING",
      replayable: true,
      replayedFromId: originalDeliveryId,
      replayedAt: new Date()
    }
  });
  await originalRow.getByRole("button", { name: "Replay" }).click();

  await expect(page.getByTestId("platform-email-replay-error")).toContainText(
    "A replay of this email is already queued."
  );
  await expect(originalRow.getByRole("button", { name: "Replay" })).toBeEnabled();
  await expect(page.getByTestId("route-error")).toHaveCount(0);
  expect(await prisma.emailDelivery.count({ where: { replayedFromId: originalDeliveryId } })).toBeGreaterThanOrEqual(3);

  await prisma.emailDelivery.delete({ where: { id: activeReplay.id } });
});
