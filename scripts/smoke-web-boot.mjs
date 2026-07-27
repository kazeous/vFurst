#!/usr/bin/env node
/**
 * Boot the web app through its real npm dev lifecycle without CI/E2E env
 * injection. The generated app env files are restored exactly after the run.
 */
import { spawn } from "node:child_process";
import console from "node:console";
import { createServer } from "node:http";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { fileURLToPath } from "node:url";
import { readEnvFile } from "./lib/env-file.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = "127.0.0.1";
const generatedEnvFiles = ["apps/web/.env.local", "apps/worker/.env"];
const assertionText = "[check-app-env] @vfurst/web configuration is complete.";
const readyPattern = /\bReady in\b/i;

async function snapshotGeneratedFiles() {
  return Promise.all(
    generatedEnvFiles.map(async (relativePath) => {
      const path = join(repoRoot, relativePath);

      try {
        return { path, contents: await readFile(path) };
      } catch (error) {
        if (error.code === "ENOENT") {
          return { path, contents: null };
        }
        throw error;
      }
    })
  );
}

async function restoreGeneratedFiles(snapshots) {
  for (const { path, contents } of snapshots) {
    if (contents !== null) {
      await writeFile(path, contents);
      continue;
    }

    try {
      await unlink(path);
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }
}

function applicationContractKeys() {
  const contract = readEnvFile(join(repoRoot, "apps/web/.env.example"));

  if (!contract) {
    throw new Error("apps/web/.env.example is required for the boot smoke.");
  }

  return Object.keys(contract);
}

function stripAppConfiguration(environment, keys) {
  for (const key of keys) {
    delete environment[key];
  }

  return {
    ...environment,
    CI: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    NEXT_TELEMETRY_DISABLED: "1"
  };
}

async function availablePort() {
  const probe = createServer();

  return new Promise((resolvePromise, reject) => {
    probe.once("error", reject);
    probe.listen(0, host, () => {
      const address = probe.address();

      if (!address || typeof address === "string") {
        probe.close();
        reject(new Error("Could not allocate a loopback port for the boot smoke."));
        return;
      }

      probe.close((error) => (error ? reject(error) : resolvePromise(address.port)));
    });
  });
}

function waitForBoot(child) {
  let output = "";
  let assertionSeen = false;
  let readySeen = false;

  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Developer boot timed out after 60s (check-app-env=${assertionSeen}, next-ready=${readySeen}).\n${output}`
        )
      );
    }, 60_000);

    const finish = (callback) => {
      clearTimeout(timeout);
      callback();
    };

    const collect = (chunk, destination) => {
      destination.write(chunk);
      output = `${output}${chunk}`.slice(-20_000);
      assertionSeen ||= output.includes(assertionText);
      readySeen ||= readyPattern.test(output);

      if (assertionSeen && readySeen) {
        finish(resolvePromise);
      }
    };

    child.stdout.on("data", (chunk) => collect(chunk, process.stdout));
    child.stderr.on("data", (chunk) => collect(chunk, process.stderr));
    child.once("error", (error) => finish(() => reject(error)));
    child.once("exit", (code, signal) => {
      if (!assertionSeen || !readySeen) {
        finish(() =>
          reject(
            new Error(
              `Developer boot exited early (code=${code}, signal=${signal ?? "none"}).\n${output}`
            )
          )
        );
      }
    });
  });
}

async function terminateProcessTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") {
      throw error;
    }
  }
}

async function withTimeout(promise, milliseconds, description) {
  let timeout;

  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${description} did not complete within ${milliseconds / 1_000}s.`)),
          milliseconds
        );
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function runPredev(keys, npmCli) {
  const child = spawn(process.execPath, [npmCli, "run", "predev", "--workspace", "@vfurst/web"], {
    cwd: repoRoot,
    env: stripAppConfiguration({ ...process.env }, keys),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let output = "";
  const collect = (chunk, destination) => {
    destination.write(chunk);
    output += chunk;
  };

  child.stdout.on("data", (chunk) => collect(chunk, process.stdout));
  child.stderr.on("data", (chunk) => collect(chunk, process.stderr));

  const { code, signal } = await new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (exitCode, exitSignal) => resolvePromise({ code: exitCode, signal: exitSignal }));
  });

  if (code !== 0) {
    throw new Error(`predev failed (code=${code}, signal=${signal ?? "none"}).\n${output}`);
  }
  if (!output.includes(assertionText)) {
    throw new Error(`predev passed without proving that check-app-env ran.\n${output}`);
  }
}

async function runControlledWindowsBoot(keys, npmCli) {
  let app;
  let server;

  try {
    await runPredev(keys, npmCli);
    stripAppConfiguration(process.env, keys);

    const next = (await import("next")).default;
    app = next({ dev: true, dir: join(repoRoot, "apps/web"), hostname: host });
    await withTimeout(app.prepare(), 60_000, "Next development boot");

    server = createServer(app.getRequestHandler());
    const address = await new Promise((resolvePromise, reject) => {
      server.once("error", reject);
      server.listen(0, host, () => resolvePromise(server.address()));
    });

    if (!address || typeof address === "string") {
      throw new Error("Next prepared but did not bind a loopback TCP port.");
    }

    console.log(
      `[smoke-web-boot] PASS: predev configuration assertion fired and Next listened on ${host}:${address.port} without injected app env.`
    );
  } finally {
    if (server?.listening) {
      await new Promise((resolvePromise, reject) => {
        server.close((error) => (error ? reject(error) : resolvePromise()));
      });
    }
    if (app) {
      try {
        await withTimeout(app.close(), 5_000, "Next development shutdown");
      } catch (error) {
        console.warn(`[smoke-web-boot] ${error.message} The smoke process will now exit.`);
      }
    }
  }
}

async function main() {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    throw new Error("Run this smoke through `npm run test:boot-config`.");
  }

  const snapshots = await snapshotGeneratedFiles();
  const keys = applicationContractKeys();
  let child;

  try {
    if (process.platform === "win32") {
      await runControlledWindowsBoot(keys, npmCli);
      return;
    }

    const port = await availablePort();
    child = spawn(
      process.execPath,
      [
        npmCli,
        "run",
        "dev",
        "--workspace",
        "@vfurst/web",
        "--",
        "--hostname",
        host,
        "--port",
        String(port)
      ],
      {
        cwd: repoRoot,
        detached: true,
        env: stripAppConfiguration({ ...process.env }, keys),
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      }
    );

    await waitForBoot(child);
    console.log(
      `[smoke-web-boot] PASS: npm dev configuration assertion fired and Next became ready on ${host}:${port} without injected app env.`
    );
  } finally {
    if (child) {
      await terminateProcessTree(child);
    }
    await restoreGeneratedFiles(snapshots);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(`[smoke-web-boot] FAIL: ${error.stack ?? error.message}`);
    process.exit(1);
  }
);
