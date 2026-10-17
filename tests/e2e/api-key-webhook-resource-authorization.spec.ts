import { createHash } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import { loginAsStaffEmail, staffIdentityData } from "./support/staff";

type TestWebhookJob = {
  createdAt?: string;
  deliveryId?: string;
  endpointId?: string;
  orgId: string;
  type: string;
};

const prisma = new PrismaClient();
const redisUrl = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
const webhookQueue = new Queue<TestWebhookJob>("webhook", {
  connection: {
    db: redisUrl.pathname.length > 1 ? Number(redisUrl.pathname.slice(1)) : undefined,
    host: redisUrl.hostname,
    port: Number(redisUrl.port || 6379),
    username: redisUrl.username ? decodeURIComponent(redisUrl.username) : undefined,
    password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
    tls: redisUrl.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null
  }
});
const runId = `${Date.now()}-${process.pid}`;
const password = "ApiWebhookPass123!";
const ownerAEmail = `api-webhook-owner-a-${runId}@example.com`;
const ownerBEmail = `api-webhook-owner-b-${runId}@example.com`;
const orgASlug = `api-webhook-a-${runId}`;
const orgBSlug = `api-webhook-b-${runId}`;
const keyAName = `Seed API key A ${runId}`;
const keyBName = `Seed API key B ${runId}`;
const rawKeyA = `vf_test_seed_a_${runId}`;
const rawKeyB = `vf_test_seed_b_${runId}`;
const endpointAUrl = `https://hooks-a-${runId}.example.com/vfurst`;
const endpointBUrl = `https://hooks-b-${runId}.example.com/vfurst`;
const rejectedEndpointUrl = `https://rejected-${runId}.example.com/vfurst`;
const createdEndpointUrl = `https://created-${runId}.example.com/vfurst#ignored`;

let orgAId: string;
let orgBId: string;
let eventAId: string;
let eventBId: string;
let keyAId: string;
let keyBId: string;
let endpointAId: string;
let endpointBId: string;

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

test.beforeAll(async () => {
  const [ownerA, ownerB] = await Promise.all([
    prisma.user.create({ data: { email: ownerAEmail, name: "API Webhook Owner A", ...staffIdentityData() } }),
    prisma.user.create({ data: { email: ownerBEmail, name: "API Webhook Owner B", ...staffIdentityData() } })
  ]);
  const [orgA, orgB] = await Promise.all([
    prisma.organization.create({
      data: {
        name: "API Webhook Organization A",
        slug: orgASlug,
        subdomain: orgASlug,
        contactEmail: ownerAEmail,
        status: "ACTIVE",
        members: { create: { userId: ownerA.id, role: "OWNER" } },
        events: {
          create: {
            name: "API Webhook Event A",
            slug: "api-webhook-event-a",
            status: "PUBLISHED",
            startDate: new Date("2028-07-01T09:00:00Z"),
            endDate: new Date("2028-07-02T17:00:00Z")
          }
        }
      },
      include: { events: true }
    }),
    prisma.organization.create({
      data: {
        name: "API Webhook Organization B",
        slug: orgBSlug,
        subdomain: orgBSlug,
        contactEmail: ownerBEmail,
        status: "ACTIVE",
        members: { create: { userId: ownerB.id, role: "OWNER" } },
        events: {
          create: {
            name: "API Webhook Event B",
            slug: "api-webhook-event-b",
            status: "PUBLISHED",
            startDate: new Date("2028-08-01T09:00:00Z"),
            endDate: new Date("2028-08-02T17:00:00Z")
          }
        }
      },
      include: { events: true }
    })
  ]);
  orgAId = orgA.id;
  orgBId = orgB.id;
  eventAId = orgA.events[0]!.id;
  eventBId = orgB.events[0]!.id;

  const [keyA, keyB, endpointA, endpointB] = await Promise.all([
    prisma.apiKey.create({
      data: {
        orgId: orgAId,
        name: keyAName,
        keyHash: createHash("sha256").update(rawKeyA).digest("hex"),
        scopes: ["read:events"]
      }
    }),
    prisma.apiKey.create({
      data: {
        orgId: orgBId,
        name: keyBName,
        keyHash: createHash("sha256").update(rawKeyB).digest("hex"),
        scopes: ["read:registrations"]
      }
    }),
    prisma.webhookEndpoint.create({
      data: {
        orgId: orgAId,
        url: endpointAUrl,
        events: [],
        secret: "whsec_endpoint-a-secret-1234567890",
        active: false
      }
    }),
    prisma.webhookEndpoint.create({
      data: {
        orgId: orgBId,
        url: endpointBUrl,
        events: ["order.paid"],
        secret: "whsec_endpoint-b-secret-1234567890",
        active: true
      }
    })
  ]);
  keyAId = keyA.id;
  keyBId = keyB.id;
  endpointAId = endpointA.id;
  endpointBId = endpointB.id;
});

test.afterAll(async () => {
  const jobs = await webhookQueue.getJobs(["completed", "failed", "waiting", "delayed", "active"], 0, 999, false);
  await Promise.all(
    jobs
      .filter((job) => job.data.orgId === orgAId || job.data.orgId === orgBId)
      .map((job) => job.remove().catch(() => undefined))
  );
  await webhookQueue.close();
  await prisma.organization.deleteMany({ where: { slug: { in: [orgASlug, orgBSlug] } } });
  await prisma.user.deleteMany({ where: { email: { in: [ownerAEmail, ownerBEmail] } } });
  await prisma.$disconnect();
});

async function loginAsOwnerA(page: Page) {
  await loginAsStaffEmail(page, ownerAEmail);
  await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible({ timeout: 30_000 });
}

async function navigateAfterRejectedAction(page: Page, pathname: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(pathname);
      return;
    } catch (error) {
      const interrupted =
        error instanceof Error &&
        (error.message.includes("ERR_ABORTED") || error.message.includes("interrupted by another navigation"));
      if (!interrupted || attempt === 2) throw error;
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
    (response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"
  );
  await form.evaluate(
    (formElement, tamper) => {
      const htmlForm = formElement as HTMLFormElement;
      let control = htmlForm.querySelector<HTMLInputElement>(`[name="${tamper.fieldName}"]`);
      const button = Array.from(htmlForm.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => candidate.textContent?.trim() === tamper.buttonName
      );
      if (!control) {
        control = document.createElement("input");
        control.type = "hidden";
        control.name = tamper.fieldName;
        htmlForm.append(control);
      }
      if (!button) throw new Error("Expected mutation button was not found.");
      control.value = tamper.fieldValue;
      htmlForm.requestSubmit(button);
    },
    { buttonName, fieldName, fieldValue }
  );
  await responsePromise;
}

async function endpointJobs(endpointId: string) {
  const jobs = await webhookQueue.getJobs(["completed", "failed", "waiting", "delayed", "active"], 0, 999, false);
  return jobs.filter((job) => job.data.endpointId === endpointId);
}

function resourceForm(page: Page, fieldName: string, resourceId: string, buttonName: string) {
  return page
    .locator(`input[name="${fieldName}"][value="${resourceId}"]`)
    .locator(`xpath=ancestor::form[.//button[normalize-space()="${buttonName}"]]`);
}

test("API key creation keeps the secret out of the URL and the REST API remains tenant-scoped", async ({ page }) => {
  await loginAsOwnerA(page);
  const pathname = `/dashboard/organizations/${orgAId}/api-keys`;
  await page.goto(pathname);
  let form = page.getByRole("button", { name: "Create API key" }).locator("xpath=ancestor::form");
  await form.getByLabel("Name").fill(`Rejected key ${runId}`);
  await submitTamperedAction(page, pathname, form, "Create API key", "orgId", orgBId);
  expect(await prisma.apiKey.count({ where: { name: `Rejected key ${runId}` } })).toBe(0);

  await navigateAfterRejectedAction(page, pathname);
  form = page.getByRole("button", { name: "Create API key" }).locator("xpath=ancestor::form");
  await form.getByLabel("Name").fill(`Created key ${runId}`);
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"),
    form.getByRole("button", { name: "Create API key" }).click()
  ]);
  const secretBanner = page.locator('[data-created-api-key="true"]');
  await expect(secretBanner).toBeVisible();
  const rawToken = (await secretBanner.locator("code").textContent())?.trim();
  expect(rawToken).toMatch(/^vf_test_/);
  expect(new URL(page.url()).search).toBe("");

  const listResponse = await page.request.get("/api/v1/events", {
    headers: { authorization: `Bearer ${rawToken}` }
  });
  expect(listResponse.status()).toBe(200);
  const listPayload = (await listResponse.json()) as { data: Array<{ id: string; orgId: string }> };
  expect(listPayload.data).toEqual([expect.objectContaining({ id: eventAId, orgId: orgAId })]);
  expect(listPayload.data.some((event) => event.id === eventBId || event.orgId === orgBId)).toBe(false);

  const foreignDetail = await page.request.get(`/api/v1/events/${eventBId}`, {
    headers: { authorization: `Bearer ${rawToken}` }
  });
  expect(foreignDetail.status()).toBe(404);
  const missingScope = await page.request.get("/api/v1/registrations", {
    headers: { authorization: `Bearer ${rawToken}` }
  });
  expect(missingScope.status()).toBe(403);
});

test("API key scope and revoke mutations derive tenant ownership from the stored key", async ({ page }) => {
  await loginAsOwnerA(page);
  const pathname = `/dashboard/organizations/${orgAId}/api-keys`;
  await page.goto(pathname);
  let form = resourceForm(page, "keyId", keyAId, "Save scopes");
  await submitTamperedAction(page, pathname, form, "Save scopes", "keyId", keyBId);
  expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: keyBId } })).scopes).toEqual(["read:registrations"]);
  expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: keyAId } })).scopes).toEqual(["read:events"]);

  await navigateAfterRejectedAction(page, pathname);
  form = resourceForm(page, "keyId", keyAId, "Revoke");
  await submitTamperedAction(page, pathname, form, "Revoke", "keyId", keyBId);
  expect(await prisma.apiKey.count({ where: { id: keyBId, orgId: orgBId } })).toBe(1);
});

test("webhook creation rejects foreign/private targets and reveals generated secrets without a query string", async ({ page }) => {
  await loginAsOwnerA(page);
  const pathname = `/dashboard/organizations/${orgAId}/webhooks`;
  await page.goto(pathname);
  let form = page.getByRole("button", { name: "Save endpoint" }).locator("xpath=ancestor::form");
  await form.getByLabel("Endpoint URL").fill(rejectedEndpointUrl);
  await submitTamperedAction(page, pathname, form, "Save endpoint", "orgId", orgBId);
  expect(await prisma.webhookEndpoint.count({ where: { url: rejectedEndpointUrl } })).toBe(0);

  await navigateAfterRejectedAction(page, pathname);
  form = page.getByRole("button", { name: "Save endpoint" }).locator("xpath=ancestor::form");
  await form.getByLabel("Endpoint URL").fill("https://127.0.0.1/private-hook");
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"),
    form.getByRole("button", { name: "Save endpoint" }).click()
  ]);
  await expect(form.getByRole("alert")).toContainText("public DNS hostname");

  await form.getByLabel("Endpoint URL").fill(createdEndpointUrl);
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"),
    form.getByRole("button", { name: "Save endpoint" }).click()
  ]);
  const secretBanner = page.locator('[data-created-webhook-secret="true"]');
  await expect(secretBanner).toBeVisible();
  await expect(secretBanner.locator("code")).toHaveText(/^whsec_/);
  expect(new URL(page.url()).search).toBe("");
  const created = await prisma.webhookEndpoint.findFirstOrThrow({
    where: { orgId: orgAId, url: createdEndpointUrl.replace("#ignored", "") }
  });
  expect(created.secret).toMatch(/^whsec_/);
});

test("webhook update, test, and delete operations cannot target another tenant endpoint", async ({ page }) => {
  await loginAsOwnerA(page);
  const pathname = `/dashboard/organizations/${orgAId}/webhooks`;
  await page.goto(pathname);
  let form = resourceForm(page, "endpointId", endpointAId, "Update");
  await submitTamperedAction(page, pathname, form, "Update", "endpointId", endpointBId);
  expect((await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpointBId } })).url).toBe(endpointBUrl);

  const foreignJobsBefore = (await endpointJobs(endpointBId)).length;
  await navigateAfterRejectedAction(page, pathname);
  form = resourceForm(page, "endpointId", endpointAId, "Test");
  await submitTamperedAction(page, pathname, form, "Test", "endpointId", endpointBId);
  expect((await endpointJobs(endpointBId)).length).toBe(foreignJobsBefore);

  await navigateAfterRejectedAction(page, pathname);
  form = resourceForm(page, "endpointId", endpointAId, "Delete");
  await submitTamperedAction(page, pathname, form, "Delete", "endpointId", endpointBId);
  expect(await prisma.webhookEndpoint.count({ where: { id: endpointBId, orgId: orgBId } })).toBe(1);

  await navigateAfterRejectedAction(page, pathname);
  const details = resourceForm(page, "endpointId", endpointAId, "Test").locator("xpath=ancestor::details");
  await details.locator("summary").click();
  const localJobsBefore = (await endpointJobs(endpointAId)).length;
  await Promise.all([
    page.waitForResponse((response) => new URL(response.url()).pathname === pathname && response.request().method() === "POST"),
    details.getByRole("button", { name: "Test" }).click()
  ]);
  await expect.poll(async () => (await endpointJobs(endpointAId)).length).toBe(localJobsBefore + 1);
  const testJob = (await endpointJobs(endpointAId))[0]!;
  expect(testJob.data).toEqual(
    expect.objectContaining({
      endpointId: endpointAId,
      orgId: orgAId,
      type: "webhook.test",
      deliveryId: expect.any(String),
      createdAt: expect.any(String)
    })
  );
});
