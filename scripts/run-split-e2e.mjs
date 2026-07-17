import { execFileSync, spawn } from "node:child_process";
import { Buffer } from "node:buffer";
import console from "node:console";
import { randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const root = process.cwd();
const proxyHost = "127.0.0.1";
const proxyPort = 3100;
const startupTimeoutMs = 120_000;
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/vfurst?schema=public";
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const runId = `${Date.now()}-${randomUUID()}`;
const disposableEmail = `split-e2e+${runId}@example.test`;
const disposablePassword = randomBytes(24).toString("base64url");

const runtimeEnvironment = {
  ...process.env,
  DATABASE_URL: databaseUrl,
  DIRECT_DATABASE_URL: process.env.DIRECT_DATABASE_URL ?? databaseUrl,
  REDIS_URL: redisUrl,
  AUTH_SECRET: randomBytes(32).toString("base64url"),
  VFURST_IDENTITY_SERVICE_SECRET: randomBytes(32).toString("base64url"),
  VFURST_AUTH_TRANSACTION_KEY_BASE64URL: randomBytes(32).toString("base64url"),
  VFURST_TENANT_SESSION_SECRET_BASE64URL: randomBytes(32).toString("base64url"),
  VFURST_MANAGER_RATE_LIMIT_PREFIX: `vfurst:split-e2e:${process.pid}:${Date.now()}`,
  VFURST_SPLIT_E2E_RUN_ID: runId,
  VFURST_SPLIT_E2E_USER_EMAIL: disposableEmail,
  VFURST_SPLIT_E2E_USER_PASSWORD: disposablePassword,
  PLAYWRIGHT_HTML_OPEN: "never"
};

const serverArgs = ["scripts/split/run-shells.mjs"];
const testArgs = [
  "node_modules/@playwright/test/cli.js",
  "test",
  "--config=playwright.split.config.mjs",
  ...process.argv.slice(2)
];

let server;
let tests;
let stopping = false;
let recentServerOutput = "";

function rememberServerOutput(chunk, destination) {
  const text = chunk.toString("utf8");
  recentServerOutput = `${recentServerOutput}${text}`.slice(-32_000);
  if (process.env.E2E_VERBOSE) destination.write(chunk);
}

function probeRuntime(hostname, expectedRuntime) {
  return new Promise((resolveProbe) => {
    const request = http.get(
      {
        hostname: proxyHost,
        port: proxyPort,
        path: "/api/health",
        headers: { host: `${hostname}:${proxyPort}` },
        timeout: 2_000
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          try {
            const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            resolveProbe(response.statusCode === 200 && payload.runtime === expectedRuntime);
          } catch {
            resolveProbe(false);
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy();
      resolveProbe(false);
    });
    request.on("error", () => resolveProbe(false));
  });
}

async function waitForSplitRuntimes() {
  const deadline = Date.now() + startupTimeoutMs;

  while (Date.now() < deadline) {
    if (server?.exitCode !== null) {
      throw new Error(
        `Split runtime exited before becoming ready.${recentServerOutput ? `\n${recentServerOutput}` : ""}`
      );
    }

    const [managerReady, tenantReady] = await Promise.all([
      probeRuntime("manager.localhost", "platform-manager"),
      probeRuntime("console.localhost", "tenant-web")
    ]);
    if (managerReady && tenantReady) return;

    await delay(500);
  }

  throw new Error(
    `Timed out waiting for both split runtimes through the host-preserving proxy.${recentServerOutput ? `\n${recentServerOutput}` : ""}`
  );
}

function startSplitRuntimes() {
  server = spawn(process.execPath, serverArgs, {
    cwd: root,
    env: runtimeEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32"
  });

  server.stdout.on("data", (chunk) => rememberServerOutput(chunk, process.stdout));
  server.stderr.on("data", (chunk) => rememberServerOutput(chunk, process.stderr));
}

function runPlaywright() {
  return new Promise((resolveRun) => {
    tests = spawn(process.execPath, testArgs, {
      cwd: root,
      env: runtimeEnvironment,
      stdio: "inherit",
      windowsHide: true
    });

    tests.once("error", () => resolveRun(1));
    tests.once("exit", (code) => resolveRun(code ?? 1));
  });
}

function stopProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      return;
    } catch {
      // Fall through to the direct signal when taskkill cannot find the process.
    }
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}

function stopProcesses() {
  if (stopping) return;
  stopping = true;
  stopProcessTree(tests);
  stopProcessTree(server);
}

async function cleanupDisposableUser() {
  try {
    const { prisma } = await import("@vfurst/db");
    try {
      await prisma.user.deleteMany({
        where: {
          email: disposableEmail,
          name: `Split E2E ${runId}`
        }
      });
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    console.error("Failed to clean up the disposable split E2E database identity.");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => {
  stopProcesses();
  process.exitCode = 130;
});
process.once("SIGTERM", () => {
  stopProcesses();
  process.exitCode = 143;
});

try {
  startSplitRuntimes();
  await waitForSplitRuntimes();
  process.exitCode = await runPlaywright();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  stopProcesses();
  await cleanupDisposableUser();
}
