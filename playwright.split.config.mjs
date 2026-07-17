import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

export default defineConfig({
  testDir: "./tests/split-e2e",
  globalSetup: "./tests/split-e2e/global-setup.ts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  reporter: "list",
  use: {
    baseURL: "http://console.localhost:3100",
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "split-chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
