import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 4,
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  fullyParallel: true,
  reporter: "list",
  use: {
    // Must match scripts/run-e2e.mjs and the NEXT_PUBLIC_APP_URL the app was
    // built with; NEXT_PUBLIC_* values are inlined at build time.
    baseURL: "http://localhost:3000",
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
