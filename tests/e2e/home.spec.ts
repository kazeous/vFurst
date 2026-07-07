import { expect, test } from "@playwright/test";

test("renders the launch marketing home page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "vFurst" })).toBeVisible();
  await expect(page.getByText("Manage registration, hotels, stores, vendors")).toBeVisible();
  await expect(page.getByRole("link", { name: "Calculate fees" })).toBeVisible();
});
