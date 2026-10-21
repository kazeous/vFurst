import { expect, test, type Page } from "@playwright/test";
import { Prisma, PrismaClient } from "@prisma/client";
import { CreateBucketCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { Queue } from "bullmq";
import { createHash, randomUUID } from "node:crypto";
import { attendeeProfileFixture, createPortalAccountFixture, loginAsAttendee, portalOrigin } from "./support/portal";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";
import { settleSePayOrder } from "./support/sepay";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const slug = `multi-attendee-${runId}`;
const origin = portalOrigin(slug);
const ownerEmail = `multi-owner-${runId}@example.com`;
const eventName = `Multi Attendee Event ${runId}`;
const orgIds: string[] = [];
let orgId: string, otherOrgId: string, eventId: string, paidTypeId: string, freeTypeId: string, ownerId: string;
let paidAccount: { id: string; email: string }, paidSelfId: string;
let originalProvider: Awaited<ReturnType<typeof prisma.paymentProviderConfig.findUnique>>;
let providerChanged = false;
const layout = { width: 360, height: 240, elements: [
  { id: "name", type: "text", x: 10, y: 10, w: 330, h: 25, field: "attendee.name" },
  { id: "badge", type: "text", x: 10, y: 45, w: 330, h: 25, field: "attendee.badgeName" }
] };

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

async function account(label: string, name = label, targetOrg = orgId) {
  const result = await createPortalAccountFixture(prisma, { orgId: targetOrg, email: `${label}-${runId}@example.com`, name });
  const self = await attendeeProfileFixture(prisma, { orgId: targetOrg, portalAccountId: result.id, fullName: name });
  return { ...result, selfId: self.id };
}
async function cap(value: number) {
  await prisma.event.update({ where: { id: eventId }, data: { settings: { requireApproval: false, allowTransfers: true, maxRegistrationsPerUser: value } } });
}
async function attendeeStep(page: Page, tier = "Free ticket", query = "") {
  await page.goto(`${origin}/register${query}`);
  await expect(page.locator('[data-registration-ready="true"]')).toBeVisible();
  await page.getByRole("radio", { name: new RegExp(tier) }).check();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("group", { name: "Who is attending?" })).toBeVisible();
}
async function review(page: Page, id?: string, tier = "Free ticket") {
  await attendeeStep(page, tier, id ? `?attendee=${id}` : "");
  if (id) await expect(page.locator(`input[name="attendee-choice"][value="${id}"]`)).toBeChecked();
  await page.getByRole("button", { name: "Review", exact: true }).click();
}
async function registration(portalAccountId: string, attendeeProfileId: string, status: "CONFIRMED" | "CANCELLED" = "CONFIRMED") {
  return prisma.registration.create({ data: { orgId, eventId, typeId: freeTypeId, portalAccountId, attendeeProfileId, status, approvalStatus: "APPROVED" } });
}
async function template(name: string) {
  return prisma.badgeTemplate.create({ data: { orgId, eventId, name, layout, dimensions: { width: 360, height: 240 } } });
}

test.beforeAll(async () => {
  const owner = await prisma.user.create({ data: { email: ownerEmail, name: "Multi Owner", ...staffIdentityData() } });
  ownerId = owner.id;
  for (const [subdomain, name] of [[slug, "Multi Attendee Organization"], [`${slug}-other`, "Unrelated Organization"]]) {
    const org = await prisma.organization.create({ data: { slug: subdomain, subdomain, name, contactEmail: ownerEmail, status: "ACTIVE",
      ...(subdomain === slug ? { members: { create: { userId: ownerId, role: "OWNER" } } } : {}) } });
    orgIds.push(org.id);
  }
  [orgId, otherOrgId] = orgIds;
  const event = await prisma.event.create({ data: { orgId, name: eventName, slug: "multi-event", currency: "VND", status: "PUBLISHED",
    startDate: new Date("2028-05-01T09:00:00Z"), endDate: new Date("2028-05-02T17:00:00Z"),
    settings: { requireApproval: false, allowTransfers: true, maxRegistrationsPerUser: 2 } } });
  eventId = event.id;
  paidTypeId = (await prisma.registrationType.create({ data: { orgId, eventId, name: "Paid ticket", price: 100_000 } })).id;
  freeTypeId = (await prisma.registrationType.create({ data: { orgId, eventId, name: "Free ticket", price: 0, sortOrder: 1 } })).id;
  const payer = await account("multi-payer", "Parent Attendee");
  paidAccount = payer; paidSelfId = payer.selfId;
  originalProvider = await prisma.paymentProviderConfig.findUnique({ where: { provider: "SEPAY" } });
  const provider = { enabled: true, updatedById: ownerId, settings: { bankCode: "VCB", accountNumber: "123456789", accountHolder: "VFURST PLATFORM",
    bankAccountId: "e2e-bank-account", memoPrefix: "VFURST", registrationFeeVnd: 25_000, hotelFeeVnd: 25_000 } };
  await prisma.paymentProviderConfig.upsert({ where: { provider: "SEPAY" }, update: provider, create: { provider: "SEPAY", ...provider } });
  providerChanged = true;
  // Real badge rendering needs the same local S3 bucket as the E2E worker. Preserve existing objects.
  const s3 = new S3Client({ region: process.env.AWS_REGION ?? "us-east-1", endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000", forcePathStyle: true,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "minioadmin", secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "minioadmin" } });
  try {
    const Bucket = process.env.S3_BUCKET_NAME ?? "vfurst-dev";
    try { await s3.send(new HeadBucketCommand({ Bucket })); }
    catch (error) { if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error;
      await s3.send(new CreateBucketCommand({ Bucket })); }
  } finally { s3.destroy(); }
});

test.afterAll(async () => {
  try {
    if (providerChanged) {
      if (originalProvider) await prisma.paymentProviderConfig.update({ where: { provider: "SEPAY" }, data: {
        enabled: originalProvider.enabled, updatedById: originalProvider.updatedById,
        settings: originalProvider.settings as Prisma.InputJsonValue } });
      else await prisma.paymentProviderConfig.delete({ where: { provider: "SEPAY" } });
    }
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  } finally { await prisma.$disconnect(); }
});

test("two attendees under one account pay together and each gets a badge", async ({ page, request }) => {
  await loginAsAttendee(page, { subdomain: slug }, paidAccount.email);
  await review(page, paidSelfId, "Paid ticket");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await page.waitForURL(`${origin}/store`, { waitUntil: "load" });
  await attendeeStep(page, "Paid ticket");
  await page.getByRole("button", { name: "Add another attendee", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Child Attendee");
  await page.getByLabel(/Badge name/).fill("Little Star");
  await page.getByRole("button", { name: "Add attendee", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Child Attendee/ })).toBeChecked();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(page.locator(".vf-review-list")).toContainText("Badge: Little Star");
  await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  await page.waitForURL(`${origin}/store`, { waitUntil: "load" });
  await expect.poll(() => prisma.cartItem.count({ where: { orgId, cart: { portalAccountId: paidAccount.id }, itemType: "REGISTRATION" } })).toBe(2);
  await page.getByRole("button", { name: "Checkout", exact: true }).click();
  await page.waitForURL((url) => url.pathname.startsWith("/checkout/"), { waitUntil: "load" });
  const order = await prisma.order.findFirstOrThrow({ where: { orgId, portalAccountId: paidAccount.id }, include: { items: true } });
  expect(order.items).toHaveLength(2);
  await settleSePayOrder(page, prisma, order.id, process.env.SEPAY_WEBHOOK_SECRET ?? "e2e-sepay-webhook-secret");
  await expect.poll(() => prisma.registration.count({ where: { orgId, portalAccountId: paidAccount.id, status: "CONFIRMED" } })).toBe(2);
  const registrations = await prisma.registration.findMany({ where: { orgId, portalAccountId: paidAccount.id }, include: { attendeeProfile: true } });
  expect(new Set(registrations.map((row) => row.attendeeProfileId)).size).toBe(2);
  expect(registrations.map((row) => row.attendeeProfile.fullName).sort()).toEqual(["Child Attendee", "Parent Attendee"]);
  await expect.poll(async () => {
    const response = await request.get("http://127.0.0.1:8025/api/v1/messages");
    const result = await response.json();
    return result.messages.filter((message: { To: { Address: string }[]; Subject: string }) =>
      message.To.some((to) => to.Address === paidAccount.email) && message.Subject === `Registration confirmed for ${eventName}`).length;
  }, { timeout: 30_000 }).toBe(2);
  const messages = (await (await request.get("http://127.0.0.1:8025/api/v1/messages")).json()).messages;
  const bodies: string[] = [];
  for (const message of messages.filter((entry: { Subject: string }) => entry.Subject === `Registration confirmed for ${eventName}`)) {
    const detail = await (await request.get(`http://127.0.0.1:8025/api/v1/message/${message.ID}`)).json();
    bodies.push(detail.Text);
  }
  expect(bodies.filter((body) => body.includes("Hi Parent Attendee,"))).toHaveLength(1);
  expect(bodies.filter((body) => body.includes("Hi Child Attendee,"))).toHaveLength(1);
  const badgeTemplate = await template("Paid badge");
  await loginAsStaffEmail(page, ownerEmail, { returnTo: `/dashboard/events/${eventId}/badges` });
  await page.getByRole("button", { name: "Generate batch", exact: true }).click();
  await expect.poll(() => prisma.badge.count({ where: { orgId, templateId: badgeTemplate.id, generatedAt: { not: null } } }), { timeout: 30_000 }).toBe(2);
  const badges = await prisma.badge.findMany({ where: { orgId, templateId: badgeTemplate.id }, include: { registration: true } });
  expect(new Set(badges.map((badge) => badge.barcodeData)).size).toBe(2);
  expect(new Set(badges.map((badge) => badge.registration.attendeeProfileId)).size).toBe(2);
  expect(badges.every((badge) => badge.pdfUrl && badge.zplData)).toBe(true);
  // A badge-name-only match must survive both the database query and the browser filter.
  await page.goto(`/dashboard/events/${eventId}/check-in?q=Little%20Star`);
  await expect(page.getByRole("heading", { name: "Child Attendee", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Parent Attendee", exact: true })).toHaveCount(0);
  await page.goto(`/dashboard/events/${eventId}/check-in`);
  await page.getByLabel("Search or scan", { exact: true }).fill("Little Star");
  await expect(page.getByRole("heading", { name: "Child Attendee", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Parent Attendee", exact: true })).toHaveCount(0);
});

test("the cap rejects the next attendee inline", async ({ page }) => {
  const third = await attendeeProfileFixture(prisma, { orgId, portalAccountId: paidAccount.id, fullName: "Third Attendee", accountHolder: false });
  await loginAsAttendee(page, { subdomain: slug }, paidAccount.email);
  // Prepare while capacity exists, then change policy before submission to prove the server guard.
  await cap(4);
  await review(page, third.id);
  await cap(2);
  await page.getByRole("button", { name: "Complete registration", exact: true }).click();
  await expect(page.getByTestId("registration-error")).toHaveText("This event allows at most 2 attendees per account.");
  await page.locator('input[name="attendeeProfileId"]').evaluate((node, id) => { (node as HTMLInputElement).value = id; }, paidSelfId);
  await page.getByRole("button", { name: "Complete registration", exact: true }).click();
  await expect(page.getByTestId("registration-error")).toHaveText("This attendee is already registered for this event.");
  expect(await prisma.registration.count({ where: { orgId, portalAccountId: paidAccount.id } })).toBe(2);
  await cap(4);
});

test("two tabs registering the same attendee create one registration", async ({ browser }) => {
  const racer = await account("multi-racer", "Concurrent Attendee");
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all(pages.map(async (page) => { await loginAsAttendee(page, { subdomain: slug }, racer.email); await review(page, racer.selfId); }));
    const outcomes = await Promise.all(pages.map(async (page) => {
      await page.getByRole("button", { name: "Complete registration", exact: true }).click();
      await expect.poll(async () => new URL(page.url()).searchParams.has("success") ? "registered" :
        await page.getByTestId("registration-error").isVisible() ? "rejected" : "waiting").not.toBe("waiting");
      if (await page.getByTestId("registration-error").isVisible()) {
        await expect(page.getByTestId("registration-error")).toHaveText("This attendee is already registered for this event.");
        return "rejected";
      }
      return "registered";
    }));
    expect(outcomes.sort()).toEqual(["registered", "rejected"]);
    expect(await prisma.registration.count({ where: { orgId, eventId, attendeeProfileId: racer.selfId } })).toBe(1);
  } finally { await Promise.all(contexts.map((context) => context.close())); }
});

test("a stale or foreign ?attendee= falls back without leaking", async ({ page }) => {
  const viewer = await account("multi-stale", "Free Self Attendee");
  const foreign = await account("multi-foreign", "Foreign Secret Attendee", otherOrgId);
  const registered = await attendeeProfileFixture(prisma, { orgId, portalAccountId: viewer.id, fullName: "Already Enrolled Attendee", accountHolder: false });
  await registration(viewer.id, registered.id);
  await loginAsAttendee(page, { subdomain: slug }, viewer.email);
  for (const id of [foreign.selfId, registered.id, randomUUID()]) {
    await attendeeStep(page, "Free ticket", `?attendee=${id}`);
    await expect(page.getByRole("radio", { name: /Free Self Attendee/ })).toBeChecked();
    const occupied = page.getByRole("radio", { name: /Already Enrolled Attendee/ });
    await expect(occupied).toBeVisible(); await expect(occupied).toBeDisabled(); await expect(occupied).not.toBeChecked();
    await expect(page.getByText("Foreign Secret Attendee")).toHaveCount(0);
    await page.getByRole("button", { name: "Review", exact: true }).click();
    await expect(page.locator(".vf-review-list")).toContainText("Free Self Attendee");
    await expect(page.locator(".vf-review-list")).not.toContainText("Already Enrolled Attendee");
  }
});

test("accepting a transfer as a new attendee creates a recipient-owned profile", async ({ page }) => {
  const sender = await account("multi-sender", "Sender Original");
  const recipient = await account("multi-recipient", "Recipient Parent");
  const before = await prisma.attendeeProfile.findUniqueOrThrow({ where: { id: sender.selfId } });
  const source = await registration(sender.id, sender.selfId);
  const token = randomUUID();
  const transfer = await prisma.registrationTransferRequest.create({ data: { orgId, eventId, sourceRegistrationId: source.id, requesterUserId: ownerId,
    recipientEmail: recipient.email, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  await loginAsAttendee(page, { subdomain: slug }, recipient.email);
  await page.goto(`${origin}/account/transfers/${transfer.id}?token=${token}`);
  await page.getByRole("radio", { name: "New attendee", exact: true }).check();
  await page.getByLabel("Full name", { exact: true }).fill("Recipient Child");
  await page.getByLabel(/Badge name/).fill("Transfer Star");
  await page.getByRole("button", { name: "Accept transfer", exact: true }).click();
  await page.waitForURL((url) => url.searchParams.get("notice") === "accepted", { waitUntil: "load" });
  const received = await prisma.registration.findFirstOrThrow({ where: { transferredFromId: source.id }, include: { attendeeProfile: true } });
  expect(received.portalAccountId).toBe(recipient.id);
  expect(received.attendeeProfile).toMatchObject({ portalAccountId: recipient.id, orgId, fullName: "Recipient Child", badgeName: "Transfer Star", accountHolderOf: null });
  expect(await prisma.attendeeProfile.findUniqueOrThrow({ where: { id: sender.selfId } })).toEqual(before);
});

test("editing a profile re-queues only its unprinted badge", async ({ page }) => {
  const editor = await account("multi-editor", "Badge Editor");
  const active = await registration(editor.id, editor.selfId);
  const cancelled = await registration(editor.id, editor.selfId, "CANCELLED");
  const [first, second] = await Promise.all([template("Editable badge"), template("Printed badge")]);
  const data = { orgId, pdfUrl: "https://example.com/old.pdf", zplData: "OLD", generatedAt: new Date("2026-10-01T00:00:00Z") };
  const editable = await prisma.badge.create({ data: { ...data, registrationId: active.id, templateId: first.id, barcodeData: `edit-${runId}` } });
  const printed = await prisma.badge.create({ data: { ...data, registrationId: active.id, templateId: second.id, barcodeData: `printed-${runId}`, printedAt: new Date() } });
  const inactive = await prisma.badge.create({ data: { ...data, registrationId: cancelled.id, templateId: first.id, barcodeData: `cancelled-${runId}` } });
  const redis = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  const queue = new Queue("badge", { connection: { host: redis.hostname, port: Number(redis.port || 6379),
    username: redis.username || undefined, password: redis.password || undefined } });
  const wasPaused = await queue.isPaused();
  await queue.pause();
  try {
    await loginAsAttendee(page, { subdomain: slug }, editor.email);
    await page.goto(`${origin}/account/attendees/${editor.selfId}`);
    await page.getByLabel(/Badge name/).fill("Fresh Badge Name");
    await page.getByRole("button", { name: "Save attendee", exact: true }).click();
    await page.waitForURL(`${origin}/account/attendees?notice=saved`, { waitUntil: "load" });
    expect(await prisma.badge.findUniqueOrThrow({ where: { id: editable.id } })).toMatchObject({ pdfUrl: null, zplData: null, generatedAt: null, renderIssue: null });
    expect(await prisma.badge.findUniqueOrThrow({ where: { id: printed.id } })).toEqual(printed);
    expect(await prisma.badge.findUniqueOrThrow({ where: { id: inactive.id } })).toEqual(inactive);
    await queue.resume();
    await expect.poll(async () => (await prisma.badge.findUniqueOrThrow({ where: { id: editable.id } })).generatedAt, { timeout: 30_000 }).not.toBeNull();
    const rendered = await prisma.badge.findUniqueOrThrow({ where: { id: editable.id } });
    expect(rendered.zplData).toContain("^CI28");
    expect(rendered.zplData).not.toBe("OLD");
    expect(rendered.renderIssue).toBeNull();
    expect(await prisma.badge.findUniqueOrThrow({ where: { id: printed.id } })).toEqual(printed);
    expect(await prisma.badge.findUniqueOrThrow({ where: { id: inactive.id } })).toEqual(inactive);
  } finally { if (wasPaused) await queue.pause(); else await queue.resume(); await queue.close(); }
});

async function walkIn(page: Page, email: string, name: string) {
  await loginAsStaffEmail(page, ownerEmail, { returnTo: `/dashboard/events/${eventId}/check-in/cashier` });
  await page.getByLabel("Attendee name", { exact: true }).fill(name);
  await page.getByLabel("Attendee email", { exact: true }).fill(email);
  await page.locator('select[name="typeId"]').selectOption(freeTypeId);
  await page.getByLabel("Amount collected", { exact: true }).fill("0");
  await page.getByRole("button", { name: "Complete registration", exact: true }).click();
  await expect.poll(() => prisma.registration.count({ where: { orgId, portalAccount: { email }, status: "CHECKED_IN" } })).toBe(1);
}

test("a cashier walk-in for a different name under an existing email adds a second profile", async ({ page }) => {
  const parent = await account("multi-cashier", "Cashier Parent");
  await walkIn(page, parent.email, "Cashier Child");
  expect(await prisma.attendeeProfile.count({ where: { orgId, portalAccountId: parent.id } })).toBe(2);
  const child = await prisma.registration.findFirstOrThrow({ where: { orgId, portalAccountId: parent.id }, include: { attendeeProfile: true } });
  expect(child.attendeeProfile).toMatchObject({ fullName: "Cashier Child", accountHolderOf: null });
  expect((await prisma.attendeeProfile.findUniqueOrThrow({ where: { id: parent.selfId } })).fullName).toBe("Cashier Parent");
});

test("a walk-in for the same name in other Unicode spacing reuses the free profile", async ({ page }) => {
  const attendee = await account("multi-unicode", "Nguyễn Văn An");
  await template("Unicode walk-in badge");
  await walkIn(page, attendee.email, "Nguyễn  Văn An".normalize("NFD"));
  expect(await prisma.attendeeProfile.count({ where: { orgId, portalAccountId: attendee.id } })).toBe(1);
  expect((await prisma.registration.findFirstOrThrow({ where: { orgId, portalAccountId: attendee.id } })).attendeeProfileId).toBe(attendee.selfId);
  const walkInBadge = () => prisma.badge.findFirst({ where: { orgId, registration: { portalAccountId: attendee.id } } });
  await expect.poll(async () => (await walkInBadge())?.generatedAt ?? null, { timeout: 30_000 }).not.toBeNull();
  const rendered = await walkInBadge();
  expect(rendered?.renderIssue).toBeNull();
  expect(rendered?.pdfUrl).toEqual(expect.any(String));
  expect(rendered?.zplData).toContain("^CI28");
  expect(rendered?.zplData).toContain("^GFA");
});

test("the organizer detail shows the date of birth as entered", async ({ page }) => {
  const attendee = await account("multi-dob", "DOB Attendee");
  await prisma.attendeeProfile.update({ where: { id: attendee.selfId }, data: { dateOfBirth: new Date("2010-05-01T00:00:00.000Z") } });
  const row = await registration(attendee.id, attendee.selfId);
  await loginAsStaffEmail(page, ownerEmail, { returnTo: `/dashboard/events/${eventId}/registrations/${row.id}` });
  await expect(page.getByText("1 May 2010", { exact: true })).toBeVisible();
  expect((await prisma.attendeeProfile.findUniqueOrThrow({ where: { id: attendee.selfId } })).dateOfBirth?.toISOString()).toBe("2010-05-01T00:00:00.000Z");
});

test("the registration page loads the account and attendees in one request", async ({ page }) => {
  const attendee = await account("one-request", "One Request Attendee");
  await loginAsAttendee(page, { subdomain: slug }, attendee.email);
  const paths: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/api/portal/")) paths.push(pathname);
  });
  await attendeeStep(page);
  expect(paths).toEqual(["/api/portal/attendees"]);
  await expect(page.getByRole("group", { name: "Who is attending?" }).getByRole("radio", { name: /One Request Attendee/ })).toBeChecked();
});

test("an attendee added in step 2 survives Back and Continue", async ({ page }) => {
  const attendee = await account("back-forth", "Back Forth Parent");
  await loginAsAttendee(page, { subdomain: slug }, attendee.email);
  const paths: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/api/portal/")) paths.push(pathname);
  });
  await attendeeStep(page);
  await page.getByRole("button", { name: "Add another attendee", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Back Forth Attendee");
  await page.getByRole("button", { name: "Add attendee", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Back Forth Attendee/ })).toBeChecked();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("radio", { name: /Back Forth Attendee/ })).toBeVisible();
  expect(paths).toEqual(["/api/portal/attendees", "/api/portal/attendees"]);
});

test("a signed-out visitor sees the sign-in prompt", async ({ page }) => {
  const paths: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith("/api/portal/")) paths.push(pathname);
  });
  await page.goto(`${origin}/register`);
  const prompt = page.locator("section").filter({ has: page.getByRole("heading", { name: "Sign in before continuing", exact: true }) });
  await expect(prompt.getByRole("heading", { name: "Sign in before continuing", exact: true })).toBeVisible();
  await expect(prompt.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(prompt.getByRole("link", { name: "Create account", exact: true })).toBeVisible();
  expect(paths).toEqual(["/api/portal/attendees"]);
});
