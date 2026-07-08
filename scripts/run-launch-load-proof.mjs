import { readFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const explicitEnv = new Set(Object.keys(process.env));
const root = process.cwd();
const webRoot = join(root, "apps", "web");
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const k6Args = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ["--quiet"];
const ignoredDotEnvNames = new Set(["NODE_ENV"]);

let server;
let startedServer = false;
let serverStdout = "";
let serverStderr = "";
let config;

function isEnabled(value) {
  return ["1", "true", "yes"].includes(String(value ?? "").toLowerCase());
}

function readConfig() {
  const serverHost = process.env.VFURST_LOAD_SERVER_HOST ?? "0.0.0.0";
  const appHost = process.env.VFURST_LOAD_APP_HOST ?? (serverHost === "0.0.0.0" ? "127.0.0.1" : serverHost);
  const port = process.env.VFURST_LOAD_SERVER_PORT ?? "3000";
  const slug = process.env.VFURST_LOAD_ORG_SLUG ?? `load-full-${Date.now()}`;

  return {
    serverHost,
    appHost,
    port,
    baseUrl: process.env.VFURST_BASE_URL ?? `http://${appHost}:${port}`,
    registrations: process.env.VFURST_LOAD_SEED_REGISTRATIONS ?? "1500",
    slug,
    staffEmail: process.env.VFURST_STAFF_EMAIL ?? `load-admin-${slug}@example.com`,
    staffPassword: process.env.VFURST_STAFF_PASSWORD ?? "LoadPass123!",
    registrationVus: process.env.VFURST_REGISTRATION_VUS ?? "1000",
    checkInVus: process.env.VFURST_CHECKIN_VUS ?? "500",
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
      if (serverExitListener && server) {
        server.off("exit", serverExitListener);
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

    if (options.abortOnServerExit && server) {
      serverExitListener = () => {
        stopChild();
      };
      server.once("exit", serverExitListener);
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

async function canReachApp() {
  try {
    const response = await fetch(config.baseUrl, { signal: AbortSignal.timeout(2_000) });
    return response.status >= 200 && response.status < 500;
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

    if (server?.exitCode !== null) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  const tail = serverLogTail();

  throw new Error(`Timed out waiting for ${config.baseUrl}.${tail ? `\n${tail}` : ""}`);
}

function startServer() {
  server = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", config.serverHost, "--port", config.port],
    {
      cwd: webRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    }
  );
  startedServer = true;

  server.stdout.on("data", (chunk) => {
    serverStdout += chunk;
    if (process.env.VFURST_LOAD_VERBOSE_SERVER) {
      process.stdout.write(chunk);
    }
  });

  server.stderr.on("data", (chunk) => {
    serverStderr += chunk;
    process.stderr.write(chunk);
  });
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
  if (!startedServer || !server?.pid || server.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    const result = spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });

    if (result.status === 0) {
      return;
    }
  }

  server.kill("SIGTERM");
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

async function main() {
  await loadDotEnv(".env");
  await loadDotEnv(".env.local");
  config = readConfig();
  process.env.NODE_ENV = "production";

  if (!config.skipBuild) {
    const build = await run(process.execPath, [nextBin, "build"], { cwd: webRoot });

    if (build.code !== 0) {
      throw new Error(`Web production build failed with exit code ${build.code}.`);
    }
  }

  const eventId = await seedLoadData();

  try {
    if (!config.skipLocalServer && !(await canReachApp())) {
      startServer();
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
        VFURST_LOAD_PROFILE: "full",
        VFURST_REGISTRATION_VUS: config.registrationVus,
        VFURST_CHECKIN_VUS: config.checkInVus
      },
      abortOnServerExit: startedServer
    });

    if (startedServer && server?.exitCode !== null) {
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
