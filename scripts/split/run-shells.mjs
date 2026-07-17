import { spawn, spawnSync } from "node:child_process";
import console from "node:console";
import { existsSync } from "node:fs";
import http from "node:http";
import { join, resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { readSplitHostConfig } from "./host-routing.mjs";
import { listenForSplitTraffic } from "./proxy.mjs";

const root = resolve(import.meta.dirname, "..", "..");
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const config = readSplitHostConfig();
const serverMode = process.env.VFURST_SPLIT_SERVER_MODE?.trim() || "dev";
const startupTimeoutMs = 120_000;
const children = [];

let proxyServer;
let shutdownPromise;

function isEnabled(value) {
  return ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function validateTopology() {
  if (!existsSync(nextBin)) {
    throw new Error("Next.js is not installed. Run npm install before starting the split shells.");
  }

  if (!["dev", "start"].includes(serverMode)) {
    throw new Error("VFURST_SPLIT_SERVER_MODE must be dev or start.");
  }

  for (const app of ["platform-manager", "tenant-web"]) {
    if (!existsSync(join(root, "apps", app, "package.json"))) {
      throw new Error(`apps/${app} does not exist yet. Create both split application shells before running this topology.`);
    }
  }
}

function prefixOutput(stream, label, destination) {
  let remainder = "";

  stream.on("data", (chunk) => {
    const lines = `${remainder}${chunk}`.split(/\r?\n/);
    remainder = lines.pop() ?? "";

    for (const line of lines) {
      destination.write(`[${label}] ${line}\n`);
    }
  });

  stream.on("end", () => {
    if (remainder) {
      destination.write(`[${label}] ${remainder}\n`);
    }
  });
}

function startNextApp(app, port) {
  const managerHost = config.managerHosts.find((host) => host === "manager.localhost") ?? config.managerHosts[0] ?? "localhost";
  const tenantRoot = config.managedRootDomains.find((host) => host === "localhost") ?? config.managedRootDomains[0] ?? "localhost";
  const proxyOrigin = (host) => `http://${host}:${config.proxyPort}`;
  const localRuntimeEnvironment = app === "platform-manager"
    ? {
        NEXT_PUBLIC_PLATFORM_MANAGER_URL: process.env.NEXT_PUBLIC_PLATFORM_MANAGER_URL ?? proxyOrigin(managerHost),
        NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? tenantRoot,
        AUTH_URL: process.env.AUTH_URL ?? proxyOrigin(managerHost)
      }
    : {
        VFURST_TENANT_ROOT_DOMAIN: process.env.VFURST_TENANT_ROOT_DOMAIN ?? tenantRoot,
        VFURST_MANAGER_URL: process.env.VFURST_MANAGER_URL ?? proxyOrigin(managerHost),
        VFURST_CONSOLE_URL: process.env.VFURST_CONSOLE_URL ?? proxyOrigin(`console.${tenantRoot}`),
        VFURST_API_URL: process.env.VFURST_API_URL ?? proxyOrigin(`api.${tenantRoot}`),
        DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://localhost:5432/vfurst",
        REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379"
      };
  const child = spawn(
    process.execPath,
    [nextBin, serverMode, join(root, "apps", app), "--hostname", config.bindHost, "--port", String(port)],
    {
      cwd: root,
      env: {
        ...process.env,
        ...localRuntimeEnvironment,
        VFURST_RUNTIME_NAME: app
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: process.platform !== "win32"
    }
  );

  const tracked = { app, child, expectedExit: false };
  children.push(tracked);
  prefixOutput(child.stdout, app, process.stdout);
  prefixOutput(child.stderr, app, process.stderr);

  child.once("error", (error) => {
    console.error(`[${app}] failed to start`, error);
    void shutdown(1);
  });
  child.once("exit", (code, signal) => {
    if (!tracked.expectedExit) {
      console.error(`[${app}] exited unexpectedly (${signal ?? code ?? "unknown"}).`);
      void shutdown(code && code > 0 ? code : 1);
    }
  });

  return child;
}

function probe(port, hostHeader) {
  return new Promise((resolveProbe) => {
    const request = http.get(
      {
        hostname: config.bindHost,
        port,
        path: "/",
        headers: { host: hostHeader },
        timeout: 2_000
      },
      (response) => {
        response.resume();
        resolveProbe((response.statusCode ?? 500) < 500);
      }
    );

    request.on("timeout", () => {
      request.destroy();
      resolveProbe(false);
    });
    request.on("error", () => resolveProbe(false));
  });
}

async function waitForApp(app, port, hostHeader) {
  const deadline = Date.now() + startupTimeoutMs;

  while (Date.now() < deadline) {
    const tracked = children.find((entry) => entry.app === app);

    if (!tracked || tracked.child.exitCode !== null) {
      throw new Error(`${app} exited before becoming ready.`);
    }

    if (await probe(port, hostHeader)) {
      return;
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for ${app} on ${config.bindHost}:${port}.`);
}

async function stopChild(tracked) {
  tracked.expectedExit = true;
  const child = tracked.child;

  if (!child.pid || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });

    if (result.status === 0) {
      return;
    }
  }

  const exitPromise = new Promise((resolveExit) => child.once("exit", resolveExit));
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }

  await Promise.race([exitPromise, delay(5_000)]);

  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      child.kill("SIGKILL");
    }
    await Promise.race([exitPromise, delay(1_000)]);
  }
}

function closeProxy() {
  if (!proxyServer) {
    return Promise.resolve();
  }

  const server = proxyServer;
  proxyServer = undefined;

  return new Promise((resolveClose) => {
    server.close(() => resolveClose());
    server.closeSplitConnections?.();
  });
}

function shutdown(exitCode = 0) {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    await closeProxy();
    await Promise.all([...children].reverse().map(stopChild));
    process.exitCode = exitCode;
  })();

  return shutdownPromise;
}

async function main() {
  validateTopology();
  startNextApp("platform-manager", config.managerPort);
  startNextApp("tenant-web", config.tenantPort);

  await Promise.all([
    waitForApp("platform-manager", config.managerPort, config.managerHosts[0] ?? "localhost"),
    waitForApp("tenant-web", config.tenantPort, config.tenantHosts[0] ?? "console.localhost")
  ]);

  proxyServer = await listenForSplitTraffic(config);
  console.info(`Split proxy listening at http://${config.bindHost}:${config.proxyPort}.`);
  console.info(`Platform manager: ${config.managerHosts.join(", ")} -> ${config.managerPort}.`);
  console.info(
    `Tenant web: ${[...config.tenantHosts, ...config.managedRootDomains.map((rootDomain) => `*.${rootDomain}`), ...config.customTenantHosts].join(", ")} -> ${config.tenantPort}.`
  );

  if (isEnabled(process.env.VFURST_SPLIT_SMOKE_EXIT)) {
    console.info("Split shells are ready; VFURST_SPLIT_SMOKE_EXIT requested a clean shutdown.");
    await shutdown(0);
  }
}

process.once("SIGINT", () => void shutdown(0));
process.once("SIGTERM", () => void shutdown(0));

main().catch((error) => {
  console.error(error);
  void shutdown(1);
});
