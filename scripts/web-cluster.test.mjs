import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseWorkerCount, checkConnectionBudget } from "./web-cluster.mjs";
import * as launcher from "./web-cluster.mjs";

const launcherPath = resolve("scripts/web-cluster.mjs");
const fixturePath = resolve("scripts/web-cluster.fixture.mjs");

async function freePort() {
  const server = http.createServer();
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address();
  await new Promise((done) => server.close(done));
  return port;
}

async function startLauncher(t, { replicas, mode = "serve", env = {}, args = [fixturePath] }) {
  const port = await freePort();
  const inherited = { ...process.env };
  for (const key of ["VFURST_DB_CONNECTION_LIMIT", "VFURST_DB_CONNECTION_BUDGET", "VFURST_WEB_REPLICAS", "VFURST_WORKER_REPLICAS"]) delete inherited[key];
  const child = spawn(process.execPath, [launcherPath, ...args], {
    env: { ...inherited, PORT: String(port), HOSTNAME: "127.0.0.1", WEB_CLUSTER_FIXTURE_MODE: mode, VFURST_WEB_REPLICAS: String(replicas), ...env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exited = new Promise((done, reject) => {
    child.once("exit", (code, signal) => done({ code, signal }));
    child.once("error", reject);
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
  });
  return { child, port, stdout: () => stdout, stderr: () => stderr, exited };
}

async function waitForOutput(handle, pattern, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (pattern.test(handle.stdout() + handle.stderr())) return;
    if (handle.child.exitCode !== null || handle.child.signalCode !== null) break;
    await delay(50);
  }
  assert.fail(`Missing ${pattern}:\n${handle.stdout()}\n${handle.stderr()}`);
}

function getPid(port, path = "/") {
  return new Promise((done, reject) => {
    const request = http.get({ hostname: "127.0.0.1", port, path, agent: false }, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try { assert.equal(response.statusCode, 200); done(JSON.parse(body).pid); } catch (error) { reject(error); }
      });
      response.on("error", reject);
    });
    request.setTimeout(5_000, () => request.destroy(new Error("Request timed out")));
    request.on("error", reject);
  });
}

const budgetEnv = { VFURST_DB_CONNECTION_BUDGET: "80", VFURST_DB_CONNECTION_LIMIT: "4", VFURST_WORKER_REPLICAS: "1" };

test("parseWorkerCount defaults to one when unset", () => {
  assert.equal(parseWorkerCount(undefined), 1);
});
test("parseWorkerCount accepts trimmed positive integers", () => {
  assert.equal(parseWorkerCount("3"), 3);
  assert.equal(parseWorkerCount(" 3 "), 3);
});
test("parseWorkerCount rejects non-positive or non-integer values", () => {
  for (const value of ["0", "-1", "2.5", "abc", ""]) assert.throws(() => parseWorkerCount(value), /VFURST_WEB_REPLICAS must be a positive integer\./);
});
test("checkConnectionBudget accepts demand within the budget", () => {
  assert.deepEqual(checkConnectionBudget(budgetEnv, 3), { status: "ok", demand: 16, budget: 80 });
});
test("checkConnectionBudget accepts demand exactly at the budget", () => {
  assert.deepEqual(checkConnectionBudget(budgetEnv, 19), { status: "ok", demand: 80, budget: 80 });
});
test("checkConnectionBudget reports demand over the budget", () => {
  assert.deepEqual(checkConnectionBudget(budgetEnv, 20), { status: "exceeded", message: "Database pool demand 84 exceeds VFURST_DB_CONNECTION_BUDGET=80 (20 web + 1 worker processes x 4)." });
});
test("checkConnectionBudget skips without a budget", () => {
  assert.deepEqual(checkConnectionBudget({}, 3), { status: "skipped" });
});
test("checkConnectionBudget applies the default limit and worker count", () => {
  assert.deepEqual(checkConnectionBudget({ VFURST_DB_CONNECTION_BUDGET: "80" }, 3), { status: "ok", demand: 16, budget: 80 });
});
test("checkConnectionBudget rejects invalid inputs", () => {
  for (const [key, value] of [["VFURST_DB_CONNECTION_LIMIT", "x"], ["VFURST_DB_CONNECTION_BUDGET", "0"], ["VFURST_WORKER_REPLICAS", "-1"]]) {
    assert.throws(() => checkConnectionBudget({ ...budgetEnv, [key]: value }, 3), new RegExp(`${key} must be a positive integer\\.`));
  }
});

test("exits 1 without an entry", { timeout: 15_000 }, async (t) => {
  const handle = await startLauncher(t, { replicas: 1, args: [] });
  assert.equal((await handle.exited).code, 1);
  assert.match(handle.stderr(), /Usage: node scripts\/web-cluster\.mjs <entry>/);
});
test("exits 1 for an invalid worker count before starting anything", { timeout: 15_000 }, async (t) => {
  const handle = await startLauncher(t, { replicas: "0" });
  assert.equal((await handle.exited).code, 1);
  assert.ok(handle.stderr().includes("[web-cluster] VFURST_WEB_REPLICAS must be a positive integer."));
  assert.doesNotMatch(handle.stdout(), /fixture listening/);
});
test("exits 1 when the connection budget is exceeded", { timeout: 15_000 }, async (t) => {
  const handle = await startLauncher(t, { replicas: 20, env: budgetEnv });
  assert.equal((await handle.exited).code, 1);
  assert.ok(handle.stderr().includes("[web-cluster] Database pool demand 84 exceeds VFURST_DB_CONNECTION_BUDGET=80 (20 web + 1 worker processes x 4)."));
  assert.doesNotMatch(handle.stdout(), /fixture listening/);
});
test("runs the entry in its own process when the count is one", { timeout: 15_000 }, async (t) => {
  const handle = await startLauncher(t, { replicas: 1 });
  await waitForOutput(handle, /fixture listening/);
  assert.equal(await getPid(handle.port), handle.child.pid);
  assert.match(handle.stdout(), /VFURST_WEB_REPLICAS=1: running/);
});
test("leaves SIGTERM to the entry when the count is one", { skip: process.platform === "win32", timeout: 15_000 }, async (t) => {
  const handle = await startLauncher(t, { replicas: 1 });
  await waitForOutput(handle, /fixture listening/);
  handle.child.kill("SIGTERM");
  assert.equal((await handle.exited).code, 0);
  assert.match(handle.stdout(), /fixture SIGTERM/);
  assert.doesNotMatch(handle.stdout(), /\[web-cluster\] SIGTERM/);
});
test("serves through three workers in round robin", { timeout: 15_000 }, async (t) => {
  const handle = await startLauncher(t, { replicas: 3 });
  await waitForOutput(handle, /\[web-cluster\] 3\/3 workers listening on \d+/);
  const pids = new Set();
  for (let i = 0; i < 30; i++) pids.add(await getPid(handle.port));
  assert.equal(pids.size, 3);
  assert.ok(!pids.has(handle.child.pid));
  await delay(1_000);
  assert.equal(handle.stdout().match(/\[web-cluster\] 3\/3 workers listening on \d+/g)?.length, 1);
});

async function exitWithin(handle, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      handle.exited,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Launcher did not exit in time")), timeoutMs); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function workerPids(handle, count) {
  await waitForOutput(handle, new RegExp(`\\[web-cluster\\] ${count}/${count} workers listening`));
  const pids = new Set();
  for (let i = 0; i < 30; i++) pids.add(await getPid(handle.port));
  assert.equal(pids.size, count);
  return pids;
}

test("replaces a killed worker", { timeout: 15_000 }, async (t) => {
  const handle = await startLauncher(t, { replicas: 3 });
  const original = await workerPids(handle, 3);
  process.kill([...original][0], "SIGKILL");
  await waitForOutput(handle, /worker \d+ \(pid \d+\) exited with \S+; restarting in 1s/);
  const deadline = Date.now() + 5_000;
  let replacement;
  while (Date.now() < deadline) {
    try {
      const pid = await new Promise((done, reject) => {
        const request = http.get({ hostname: "127.0.0.1", port: handle.port, path: "/", agent: false }, (response) => {
          let body = "";
          response.on("data", (chunk) => { body += chunk; });
          response.on("end", () => {
            try { assert.equal(response.statusCode, 200); done(JSON.parse(body).pid); } catch (error) { reject(error); }
          });
          response.on("error", reject);
        });
        request.setTimeout(1_000, () => request.destroy(new Error("Request timed out")));
        request.on("error", reject);
      });
      if (!original.has(pid)) { replacement = pid; break; }
    } catch {
      // A connection handed to the dying worker may fail before its replacement is ready.
    }
    await delay(50);
  }
  assert.ok(replacement, "A replacement worker must serve within 5 s");
  assert.match(handle.stderr(), /worker \d+ \(pid \d+\) exited with \S+; restarting in 1s/);
  assert.equal(handle.child.exitCode, null);
});
test("gives up after the sixth unexpected exit", { timeout: 20_000 }, async (t) => {
  const handle = await startLauncher(t, { replicas: 2, mode: "crash" });
  assert.equal((await exitWithin(handle, 15_000)).code, 1);
  assert.match(handle.stderr(), /\[web-cluster\] \d+ worker exits in 60s; giving up/);
});
test("workers exit when the primary is killed", { timeout: 15_000 }, async (t) => {
  const handle = await startLauncher(t, { replicas: 2 });
  const pids = await workerPids(handle, 2);
  handle.child.kill("SIGKILL");
  await handle.exited;
  const isGone = (pid) => {
    try { process.kill(pid, 0); return false; } catch (error) { assert.equal(error.code, "ESRCH"); return true; }
  };
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && ![...pids].every(isGone)) await delay(50);
  for (const pid of pids) assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
});
test("drains in-flight requests on SIGTERM", { skip: process.platform === "win32", timeout: 15_000 }, async (t) => {
  const handle = await startLauncher(t, { replicas: 2 });
  const pids = await workerPids(handle, 2);
  const slow = getPid(handle.port, "/slow");
  await delay(200);
  handle.child.kill("SIGTERM");
  assert.ok(pids.has(await slow));
  assert.equal((await exitWithin(handle, 5_000)).code, 0);
  assert.ok(handle.stdout().includes("[web-cluster] SIGTERM: stopping 2 workers"));
  assert.ok(handle.stdout().includes("[web-cluster] all workers exited"));
});
test("kills workers that ignore SIGTERM after the deadline", { skip: process.platform === "win32", timeout: 40_000 }, async (t) => {
  const handle = await startLauncher(t, { replicas: 2, mode: "ignore-sigterm" });
  await workerPids(handle, 2);
  handle.child.kill("SIGTERM");
  assert.equal((await exitWithin(handle, launcher.SHUTDOWN_TIMEOUT_MS + 5_000)).code, 1);
  assert.ok(handle.stderr().includes("shutdown deadline reached; killed 2 workers"));
});
