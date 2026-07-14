import { expect, test } from "@playwright/test";

test("renders the launch marketing home page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Run the whole convention from one calm workspace." })).toBeVisible();
  await expect(page.getByText("Manage registration, hotels, stores, vendors")).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Live convention operations dashboard showing registration, check-in, and volunteer staffing"
    })
  ).toBeVisible();
  await expect(page.locator(".vf-home-hero-copy").getByRole("link", { name: "Request managed access" })).toBeVisible();
});

test("keeps the marketing hero contained on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    previewWidth: document.querySelector(".vf-hero-operations-preview")?.getBoundingClientRect().width ?? 0
  }));

  expect(layout.documentWidth).toBe(layout.viewportWidth);
  expect(layout.previewWidth).toBeGreaterThan(300);
  expect(layout.previewWidth).toBeLessThanOrEqual(layout.viewportWidth - 32);
});
