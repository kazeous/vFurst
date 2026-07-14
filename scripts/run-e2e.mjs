import { spawn, execFileSync } from "node:child_process";
import process from "node:process";

const host = "127.0.0.1";
const port = "3000";
const baseUrl = `http://${host}:${port}`;
const serverMode = process.env.E2E_PRODUCTION === "1" ? "start" : "dev";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "sk_test_e2e_stripe_secret_key_1234567890";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_stripe_signing_secret_1234567890";
const serverArgs = [
  "node_modules/next/dist/bin/next",
  serverMode,
  "apps/web",
  "--hostname",
  host,
  "--port",
  port
];
const testArgs = ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)];

let server;
let startedServer = false;

async function canReachApp() {
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForApp() {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    if (await canReachApp()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${baseUrl}`);
}

function startServer() {
  server = spawn(process.execPath, serverArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      AUTH_TRUST_HOST: "true",
      AUTH_URL: baseUrl,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-auth-secret-32-bytes-minimum-value",
      CHECKOUT_TOKEN_SECRET: process.env.CHECKOUT_TOKEN_SECRET ?? "e2e-checkout-token-secret-32-bytes-minimum",
      SEPAY_WEBHOOK_SECRET: process.env.SEPAY_WEBHOOK_SECRET ?? "e2e-sepay-webhook-secret",
      SEPAY_API_TOKEN: process.env.SEPAY_API_TOKEN ?? "e2e-sepay-api-token",
      STRIPE_SECRET_KEY: stripeSecretKey,
      STRIPE_WEBHOOK_SECRET: stripeWebhookSecret
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  startedServer = true;

  server.stdout.on("data", (chunk) => {
    if (process.env.E2E_VERBOSE) {
      process.stdout.write(chunk);
    }
  });

  server.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  server.on("exit", (code) => {
    if (code !== 0 && process.exitCode === undefined) {
      process.exitCode = code ?? 1;
    }
  });
}

function runPlaywright() {
  return new Promise((resolve) => {
    const testProcess = spawn(process.execPath, testArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        CHECKOUT_TOKEN_SECRET: process.env.CHECKOUT_TOKEN_SECRET ?? "e2e-checkout-token-secret-32-bytes-minimum",
        SEPAY_WEBHOOK_SECRET: process.env.SEPAY_WEBHOOK_SECRET ?? "e2e-sepay-webhook-secret",
        SEPAY_API_TOKEN: process.env.SEPAY_API_TOKEN ?? "e2e-sepay-api-token",
        STRIPE_SECRET_KEY: stripeSecretKey,
        STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
        PLAYWRIGHT_HTML_OPEN: "never"
      },
      stdio: "inherit",
      windowsHide: true
    });

    testProcess.on("exit", (code) => resolve(code ?? 1));
  });
}

function stopServer() {
  if (!startedServer || !server?.pid) {
    return;
  }

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall back to ChildProcess.kill below.
    }
  }

  server.kill("SIGTERM");
}

try {
  if (!(await canReachApp())) {
    startServer();
  }

  await waitForApp();
  process.exitCode = await runPlaywright();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  stopServer();
}
