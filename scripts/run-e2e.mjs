import { spawn, execFileSync } from "node:child_process";
import process from "node:process";

// This host must match the NEXT_PUBLIC_APP_URL that apps/web was BUILT with
// (apps/web/.env.local, derived from the repository-root file). Next.js inlines
// every NEXT_PUBLIC_* variable into the bundle at build time, including in
// server code, so the value injected below cannot override it in production
// mode — it only takes effect in dev mode. Keep the two in agreement.
const host = "localhost";
const port = "3000";
const baseUrl = `http://${host}:${port}`;
const serverMode = process.env.E2E_PRODUCTION === "1" ? "start" : "dev";
// Next renders a server action's redirect target by fetching it from its own bind address.
// The production image binds 0.0.0.0, which Linux connects to as loopback; Windows refuses
// it and Next falls back to a client redirect. Binding 127.0.0.1 gives every OS that same
// internal request (Host = bind address, x-forwarded-host = the original host).
const bindHost = serverMode === "start" ? "127.0.0.1" : host;
const rateLimitPrefix = process.env.VFURST_RATE_LIMIT_PREFIX ?? `vfurst:e2e:${process.pid}:${Date.now()}`;
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const stripeSecretKey = process.env.STRIPE_SECRET_KEY ?? "sk_test_e2e_stripe_secret_key_1234567890";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_e2e_stripe_signing_secret_1234567890";
const emailDeliveryEncryptionKey = process.env.EMAIL_DELIVERY_ENCRYPTION_KEY ?? "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/vfurst?schema=public";
const workerArgs = ["node_modules/tsx/dist/cli.mjs", "apps/worker/src/index.ts"];
const serverArgs = [
  "node_modules/next/dist/bin/next",
  serverMode,
  "apps/web",
  "--hostname",
  bindHost,
  "--port",
  port
];
const testArgs = ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)];

let server;
let startedServer = false;
let worker;

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
      AUTH_AUTHENTIK_ISSUER: process.env.AUTH_AUTHENTIK_ISSUER ?? "http://localhost:8090/vfurst",
      AUTH_AUTHENTIK_ID: process.env.AUTH_AUTHENTIK_ID ?? "vfurst-local",
      AUTH_AUTHENTIK_SECRET: process.env.AUTH_AUTHENTIK_SECRET ?? "vfurst-local-mock-secret",
      VFURST_PLATFORM_ADMIN_GROUP: process.env.VFURST_PLATFORM_ADMIN_GROUP ?? "vfurst-platform-admins",
      VFURST_STAFF_SESSION_MAX_AGE_SECONDS: process.env.VFURST_STAFF_SESSION_MAX_AGE_SECONDS ?? "43200",
      CHECKOUT_TOKEN_SECRET: process.env.CHECKOUT_TOKEN_SECRET ?? "e2e-checkout-token-secret-32-bytes-minimum",
      SEPAY_WEBHOOK_SECRET: process.env.SEPAY_WEBHOOK_SECRET ?? "e2e-sepay-webhook-secret",
      SEPAY_API_TOKEN: process.env.SEPAY_API_TOKEN ?? "e2e-sepay-api-token",
      STRIPE_SECRET_KEY: stripeSecretKey,
      STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
      REDIS_URL: redisUrl,
      EMAIL_DELIVERY_ENCRYPTION_KEY: emailDeliveryEncryptionKey,
      NEXT_PUBLIC_APP_URL: baseUrl,
      VFURST_RATE_LIMIT_PREFIX: rateLimitPrefix
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

function startWorker() {
  worker = spawn(process.execPath, workerArgs, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL ?? databaseUrl,
      EMAIL_DELIVERY_ENCRYPTION_KEY: emailDeliveryEncryptionKey,
      VFURST_DB_CONNECTION_LIMIT: process.env.VFURST_DB_CONNECTION_LIMIT ?? "4",
      VFURST_DB_POOL_TIMEOUT_SECONDS: process.env.VFURST_DB_POOL_TIMEOUT_SECONDS ?? "20",
      REDIS_URL: redisUrl,
      AWS_REGION: process.env.AWS_REGION ?? "us-east-1",
      AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "minioadmin",
      AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "minioadmin",
      S3_BUCKET_NAME: process.env.S3_BUCKET_NAME ?? "vfurst-dev",
      S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
      SMTP_HOST: process.env.SMTP_HOST ?? "127.0.0.1",
      SMTP_PORT: process.env.SMTP_PORT ?? "1025",
      SMTP_FROM_EMAIL: process.env.SMTP_FROM_EMAIL ?? "no-reply@localhost",
      NEXT_PUBLIC_APP_URL: baseUrl
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  worker.stdout.on("data", (chunk) => {
    if (process.env.E2E_VERBOSE) {
      process.stdout.write(chunk);
    }
  });
  worker.stderr.on("data", (chunk) => {
    process.stderr.write(chunk);
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
        REDIS_URL: redisUrl,
        EMAIL_DELIVERY_ENCRYPTION_KEY: emailDeliveryEncryptionKey,
        VFURST_RATE_LIMIT_PREFIX: rateLimitPrefix,
        PLAYWRIGHT_HTML_OPEN: "never"
      },
      stdio: "inherit",
      windowsHide: true
    });

    testProcess.on("exit", (code) => resolve(code ?? 1));
  });
}

function stopWorker() {
  if (!worker?.pid) {
    return;
  }

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(worker.pid), "/T", "/F"], { stdio: "ignore" });
      return;
    } catch {
      // Fall back to ChildProcess.kill below.
    }
  }

  worker.kill("SIGTERM");
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

  startWorker();
  await waitForApp();
  process.exitCode = await runPlaywright();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  stopWorker();
  stopServer();
}
