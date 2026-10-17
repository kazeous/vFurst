import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const subdomain = `canonical-${Date.now()}-${process.pid}`;
let organizationId: string;

test.use({ serviceWorkers: "block" });
test.beforeAll(async () => {
  const org = await prisma.organization.create({
    data: {
      name: `Canonical portal ${subdomain}`, slug: `${subdomain}-slug`, subdomain, status: "ACTIVE",
      contactEmail: `contact-${subdomain}@example.com`
    }
  });
  organizationId = org.id;
});
test.afterAll(async () => {
  try {
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
  } finally {
    await prisma.$disconnect();
  }
});

test("a central-path portal URL redirects to the portal host with 308 and keeps the query", async ({ page }) => {
  const response = await page.goto(`http://localhost:3000/${subdomain}/register?probe=1`);
  const redirect = await response?.request().redirectedFrom()?.response();
  expect(redirect?.status()).toBe(308);
  await expect(page).toHaveURL(`http://${subdomain}.localhost:3000/register?probe=1`);
});

test("a slug host redirects to the canonical subdomain host", async ({ page }) => {
  const response = await page.goto(`http://${subdomain}-slug.localhost:3000/register`);
  const redirect = await response?.request().redirectedFrom()?.response();
  expect(redirect?.status()).toBe(308);
  await expect(page).toHaveURL(`http://${subdomain}.localhost:3000/register`);
});

test("the tenant registration page is served from the ISR cache", async ({ request }) => {
  test.skip(process.env.E2E_PRODUCTION !== "1", "ISR serves cached pages only in a production build");
  const headers = { host: `${subdomain}.localhost:3000` };
  const first = await request.get("http://localhost:3000/register", { headers, maxRedirects: 0 });
  expect(first.status()).toBe(200);
  const second = await request.get("http://localhost:3000/register", { headers, maxRedirects: 0 });
  expect(second.status()).toBe(200);
  expect(second.headers()["x-nextjs-cache"]).toMatch(/^(HIT|STALE)$/);
  expect(second.headers()["cache-control"]).not.toContain("private");
});

test("a central route is not treated as a portal", async ({ page }) => {
  const response = await page.goto("http://localhost:3000/pricing");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveURL("http://localhost:3000/pricing");
});
