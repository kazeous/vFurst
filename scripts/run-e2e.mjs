import { spawn, execFileSync } from "node:child_process";
import process from "node:process";

const host = "127.0.0.1";
const port = "3000";
const baseUrl = `http://${host}:${port}`;
const serverArgs = [
  "node_modules/next/dist/bin/next",
  "dev",
  "apps/web",
  "--hostname",
  host,
  "--port",
  port
];
const testArgs = ["node_modules/@playwright/test/cli.js", "test"];

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
    env: process.env,
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
