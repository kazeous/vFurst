import { expect, test } from "@playwright/test";

test("renders the foundation home page", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "vFurst" })).toBeVisible();
  await expect(page.getByText("Manage your event, not a spreadsheet.")).toBeVisible();
});
