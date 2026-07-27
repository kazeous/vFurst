import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";
import { PrismaClient } from "@prisma/client";

const explicitEnv = new Set(Object.keys(process.env));
const root = process.cwd();
const webRoot = join(root, "apps", "web");
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const loadProxyBin = join(root, "scripts", "load-balance-next.mjs");
const k6Args = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["--quiet"];
const ignoredDotEnvNames = new Set(["NODE_ENV"]);

let serverProcesses = [];
let startedServer = false;
let serverStdout = "";
let serverStderr = "";
let config;

function isEnabled(value) {
  return ["1", "true", "yes"].includes(String(value ?? "").toLowerCase());
}

function positiveInteger(name, value, fallback) {
  const normalized = String(value ?? fallback ?? "").trim();

  if (!/^\d+$/.test(normalized) || Number(normalized) < 1 || !Number.isSafeInteger(Number(normalized))) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return Number(normalized);
}

function readConfig() {
  const serverHost = process.env.VFURST_LOAD_SERVER_HOST ?? "0.0.0.0";
  const appHost = process.env.VFURST_LOAD_APP_HOST ?? (serverHost === "0.0.0.0" ? "127.0.0.1" : serverHost);
  const port = process.env.VFURST_LOAD_SERVER_PORT ?? "3000";
  const serverReplicas = positiveInteger(
    "VFURST_LOAD_SERVER_REPLICAS",
    process.env.VFURST_LOAD_SERVER_REPLICAS ?? process.env.VFURST_WEB_REPLICAS,
    "6"
  );
  const slug = process.env.VFURST_LOAD_ORG_SLUG ?? `load-full-${Date.now()}`;

  return {
    serverHost,
    appHost,
    port,
    serverReplicas,
    baseUrl: process.env.VFURST_BASE_URL ?? `http://${appHost}:${port}`,
    registrations: process.env.VFURST_LOAD_SEED_REGISTRATIONS ?? "1500",
    slug,
    staffEmail: process.env.VFURST_STAFF_EMAIL ?? `load-admin-${slug}@example.com`,
    staffPassword: process.env.VFURST_STAFF_PASSWORD ?? "LoadPass123!",
    loadProfile: process.env.VFURST_LOAD_PROFILE ?? "full",
    registrationVus: process.env.VFURST_REGISTRATION_VUS ?? "500",
    checkInVus: process.env.VFURST_CHECKIN_VUS ?? "50",
    skipLocalServer: isEnabled(process.env.VFURST_SKIP_LOCAL_SERVER),
    skipBuild: isEnabled(process.env.VFURST_SKIP_BUILD)
  };
}

function parseDotEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const index = trimmed.indexOf("=");

  if (index < 1) {
    return null;
  }

  const name = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return { name, value };
}

async function loadDotEnv(path) {
  try {
    const content = await readFile(path, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const parsed = parseDotEnvLine(line);

      if (parsed && !explicitEnv.has(parsed.name) && !ignoredDotEnvNames.has(parsed.name)) {
        process.env[parsed.name] = parsed.value;
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function applyDatabaseConnectionLimit() {
  const limit = positiveInteger(
    "VFURST_LOAD_DB_CONNECTION_LIMIT",
    process.env.VFURST_LOAD_DB_CONNECTION_LIMIT ?? process.env.VFURST_DB_CONNECTION_LIMIT,
    "4"
  );
  const poolTimeout = positiveInteger(
    "VFURST_LOAD_DB_POOL_TIMEOUT",
    process.env.VFURST_LOAD_DB_POOL_TIMEOUT ?? process.env.VFURST_DB_POOL_TIMEOUT_SECONDS,
    "20"
  );
  const budget = positiveInteger("VFURST_DB_CONNECTION_BUDGET", process.env.VFURST_DB_CONNECTION_BUDGET, "80");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for the launch load proof.");
  }

  const url = new URL(process.env.DATABASE_URL);

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use the postgres: or postgresql: protocol.");
  }

  url.searchParams.set("connection_limit", String(limit));
  url.searchParams.set("pool_timeout", String(poolTimeout));

  process.env.DATABASE_URL = url.toString();
  process.env.VFURST_DB_CONNECTION_LIMIT = String(limit);
  process.env.VFURST_DB_POOL_TIMEOUT_SECONDS = String(poolTimeout);

  const maximumWebDemand = config.serverReplicas * limit;

  if (maximumWebDemand > budget) {
    throw new Error(
      `The load topology can open ${maximumWebDemand} Prisma connections, exceeding VFURST_DB_CONNECTION_BUDGET=${budget}.`
    );
  }

  return { budget, limit, maximumWebDemand, poolTimeout };
}

async function inspectDatabaseCapacity(policy) {
  const datasourceUrl = process.env.DIRECT_DATABASE_URL?.trim() || process.env.DATABASE_URL;
  const prisma = new PrismaClient({ datasourceUrl });

  try {
    const [capacity] = await prisma.$queryRawUnsafe(`
      SELECT
        current_setting('max_connections')::integer AS "maxConnections",
        current_setting('superuser_reserved_connections')::integer AS "reservedConnections"
    `);
    const maxConnections = Number(capacity?.maxConnections);
    const reservedConnections = Number(capacity?.reservedConnections);
    const usableConnections = maxConnections - reservedConnections;

    if (!Number.isSafeInteger(usableConnections) || usableConnections < 1) {
      throw new Error("PostgreSQL returned an invalid connection capacity.");
    }

    if (policy.budget > usableConnections) {
      throw new Error(
        `VFURST_DB_CONNECTION_BUDGET=${policy.budget} exceeds PostgreSQL usable capacity ${usableConnections}.`
      );
    }

    console.log(
      `Database capacity: ${maxConnections} max - ${reservedConnections} reserved = ${usableConnections} usable; ` +
        `${config.serverReplicas} web replicas x ${policy.limit} connections = ${policy.maximumWebDemand} ` +
        `within application budget ${policy.budget}; pool timeout ${policy.poolTimeout}s.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit",
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    let serverExitListener;

    const cleanup = () => {
      if (serverExitListener) {
        for (const { process: child } of serverProcesses) {
          child.off("exit", serverExitListener);
        }
      }
    };

    const settle = (result) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve(result);
    };

    const stopChild = () => {
      if (!child.pid || child.exitCode !== null) {
        return;
      }

      if (process.platform === "win32") {
        const result = spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });

        if (result.status === 0) {
          return;
        }
      }

      child.kill("SIGTERM");
    };

    if (options.abortOnServerExit && serverProcesses.length > 0) {
      serverExitListener = () => {
        stopChild();
      };

      for (const { process: child } of serverProcesses) {
        child.once("exit", serverExitListener);
      }
    }

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (options.echoStdout) {
          process.stdout.write(chunk);
        }
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        if (options.echoStderr) {
          process.stderr.write(chunk);
        }
      });
    }

    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("exit", (code) => {
      settle({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function canReachApp(url = config.baseUrl) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

function hasServerExited() {
  return serverProcesses.some(({ process: child }) => child.exitCode !== null);
}

async function waitForApp(url = config.baseUrl) {
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    if (await canReachApp(url)) {
      return;
    }

    if (hasServerExited()) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  const tail = serverLogTail();

  throw new Error(`Timed out waiting for ${url}.${tail ? `\n${tail}` : ""}`);
}

function trackServerProcess(label, child) {
  serverProcesses.push({ label, process: child });
  startedServer = true;

  child.stdout.on("data", (chunk) => {
    serverStdout += `[${label}] ${chunk}`;
    if (process.env.VFURST_LOAD_VERBOSE_SERVER) {
      process.stdout.write(chunk);
    }
  });

  child.stderr.on("data", (chunk) => {
    serverStderr += `[${label}] ${chunk}`;
    process.stderr.write(chunk);
  });
}

function startNextServer(port, label) {
  const child = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", config.serverHost, "--port", String(port)],
    {
      cwd: webRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );

  trackServerProcess(label, child);
  return child;
}

async function startServer() {
  if (config.serverReplicas === 1) {
    startNextServer(config.port, "next");
    return;
  }

  const basePort = Number(config.port) + 1;
  const targets = [];

  for (let index = 0; index < config.serverReplicas; index += 1) {
    const port = basePort + index;
    startNextServer(port, `next-${index + 1}`);
    targets.push(`http://${config.appHost}:${port}`);
  }

  for (const target of targets) {
    await waitForApp(target);
  }

  const proxy = spawn(process.execPath, [loadProxyBin, config.serverHost, config.port, ...targets], {
    cwd: root,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  trackServerProcess("proxy", proxy);
}

function serverLogTail() {
  return [serverStdout, serverStderr]
    .map((value) => value.split(/\r?\n/).slice(-60).join("\n"))
    .filter(Boolean)
    .join("\n");
}

function printServerTail() {
  const tail = serverLogTail();

  if (tail) {
    console.error(`\n--- Next.js server tail ---\n${tail}\n--- end Next.js server tail ---`);
  }
}

function stopServer() {
  if (!startedServer || serverProcesses.length === 0) {
    return;
  }

  for (const { process: child } of [...serverProcesses].reverse()) {
    if (!child.pid || child.exitCode !== null) {
      continue;
    }

    if (process.platform === "win32") {
      const result = spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });

      if (result.status === 0) {
        continue;
      }
    }

    child.kill("SIGTERM");
  }

  serverProcesses = [];
}

async function seedLoadData() {
  const result = await run(process.execPath, ["scripts/seed-load-test.mjs", `--registrations=${config.registrations}`, `--slug=${config.slug}`], {
    env: {
      ...process.env,
      VFURST_STAFF_EMAIL: config.staffEmail,
      VFURST_STAFF_PASSWORD: config.staffPassword
    },
    stdio: ["ignore", "pipe", "inherit"],
    echoStdout: true
  });

  if (result.code !== 0) {
    throw new Error(`Load seed failed with exit code ${result.code}.`);
  }

  const eventMatch = result.stdout.match(/VFURST_LOAD_EVENT_ID="([^"]+)"/);

  if (!eventMatch) {
    throw new Error("Could not parse VFURST_LOAD_EVENT_ID from seed output.");
  }

  return eventMatch[1];
}

async function cleanupTestFixtures() {
  const result = await run(
    process.execPath,
    [join(root, "packages", "db", "scripts", "cleanup-test-fixtures.mjs"), "--apply"],
    {
      env: process.env,
      stdio: ["ignore", "pipe", "inherit"],
      echoStdout: true
    }
  );

  if (result.code !== 0) {
    throw new Error(`Fixture cleanup failed with exit code ${result.code}.`);
  }
}

async function main() {
  await loadDotEnv(".env");
  await loadDotEnv(".env.local");
  config = readConfig();
  process.env.NODE_ENV = "production";
  const databasePolicy = applyDatabaseConnectionLimit();
  await inspectDatabaseCapacity(databasePolicy);
  await cleanupTestFixtures();

  if (!config.skipBuild) {
    const build = await run(process.execPath, [nextBin, "build"], { cwd: webRoot });

    if (build.code !== 0) {
      throw new Error(`Web production build failed with exit code ${build.code}.`);
    }
  }

  const eventId = await seedLoadData();

  try {
    if (!config.skipLocalServer && !(await canReachApp())) {
      await startServer();
      await waitForApp();
    }

    const load = await run(process.execPath, ["scripts/run-load-test.mjs", ...k6Args], {
      env: {
        ...process.env,
        VFURST_BASE_URL: config.baseUrl,
        VFURST_LOAD_ORG_SLUG: config.slug,
        VFURST_LOAD_EVENT_ID: eventId,
        VFURST_STAFF_EMAIL: config.staffEmail,
        VFURST_STAFF_PASSWORD: config.staffPassword,
        VFURST_LOAD_PROFILE: config.loadProfile,
        VFURST_REGISTRATION_VUS: config.registrationVus,
        VFURST_CHECKIN_VUS: config.checkInVus
      },
      abortOnServerExit: startedServer
    });

    if (startedServer && hasServerExited()) {
      printServerTail();
    }

    if (load.code !== 0) {
      throw new Error(`Full k6 profile failed with exit code ${load.code}.`);
    }

    process.exitCode = load.code;
  } finally {
    stopServer();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
