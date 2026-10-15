import type { Page } from "@playwright/test";

/**
 * Signs in through the central credentials form and returns only after the
 * browser has finished the full-document navigation the form starts on
 * success (`window.location.replace(returnTo)`, PR #21). A `page.goto` issued
 * before that point races the replacement and fails with net::ERR_ABORTED.
 */
export async function loginWithCredentials(page: Page, email: string, password: string, returnTo = "/dashboard") {
  const target = new URL(returnTo, "http://e2e.invalid");
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((url) => url.pathname === target.pathname && url.search === target.search, { timeout: 30_000 });
}
