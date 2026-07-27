import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { encryptEmailDeliveryPayload } from "@vfurst/email";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const password = "EmailOperationsPass123!";
const platformEmail = `email-ops-platform-${runId}@example.com`;
const ownerEmail = `email-ops-owner-${runId}@example.com`;
const recipientEmail = `email-ops-recipient-${runId}@example.com`;
const orgSlug = `email-ops-org-${runId}`;
const encryptionKey = process.env.EMAIL_DELIVERY_ENCRYPTION_KEY ?? "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

let orgId: string;
let eventId: string;
let originalDeliveryId: string;
let singleUseDeliveryId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);
test.use({ serviceWorkers: "block" });

async function loginAs(page: Page, email: string, returnTo: string) {
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(new RegExp(returnTo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), { timeout: 30_000 });
}

test.beforeAll(async () => {
  const passwordHash = await bcrypt.hash(password, 12);
  const [platformAdmin, owner] = await Promise.all([
    prisma.user.create({
      data: { email: platformEmail, name: "Email Operations Admin", passwordHash, platformRole: "PLATFORM_ADMIN" }
    }),
    prisma.user.create({ data: { email: ownerEmail, name: "Email Operations Owner", passwordHash } })
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
      lastErrorMessage: "Provider timed out.",
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
        lastErrorMessage: "Provider rejected credentials.",
        replayable: false
      }
    })
  ).id;
});

test.afterAll(async () => {
  await prisma.emailDelivery.deleteMany({
    where: {
      OR: [
        { orgId },
        { id: singleUseDeliveryId }
      ]
    }
  });
  await prisma.organization.deleteMany({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { email: { in: [platformEmail, ownerEmail] } } });
  await prisma.$disconnect();
});

test("platform operators can inspect and replay safe dead letters without seeing raw payloads", async ({ page }) => {
  await loginAs(page, platformEmail, "/platform/operations/email");

  await expect(page.getByRole("heading", { name: "Email delivery" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Email operations" })).toBeVisible();
  await expect(page.getByText(`${recipientEmail.slice(0, 1)}***@${recipientEmail.split("@")[1]}`).first()).toBeVisible();
  await expect(page.getByText(recipientEmail, { exact: true })).toHaveCount(0);
  await expect(page.getByText("Single-use content")).toBeVisible();

  const row = page.locator(".vf-table-row").filter({ hasText: "staff-message" }).filter({ has: page.getByRole("button", { name: "Replay" }) });
  await row.getByRole("button", { name: "Replay" }).click();

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
  const originalRow = page
    .locator(".vf-table-row")
    .filter({ hasText: "staff-message" })
    .filter({ has: page.getByRole("button", { name: "Replay" }) });

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
