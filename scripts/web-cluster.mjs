import cluster from "node:cluster";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SHUTDOWN_TIMEOUT_MS = 25_000;
export const RESTART_DELAY_MS = 1_000;
export const CRASH_WINDOW_MS = 60_000;
export const MAX_CRASHES_IN_WINDOW = 5;

function positiveInteger(value, name) {
  const trimmed = value.trim();
  const number = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || number < 1 || !Number.isSafeInteger(number)) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

export function parseWorkerCount(value) {
  return value === undefined ? 1 : positiveInteger(value, "VFURST_WEB_REPLICAS");
}

export function checkConnectionBudget(env, webReplicas) {
  const valueOrDefault = (name, fallback) => env[name]?.trim() ? positiveInteger(env[name], name) : fallback;
  const limit = valueOrDefault("VFURST_DB_CONNECTION_LIMIT", 4);
  const workerReplicas = valueOrDefault("VFURST_WORKER_REPLICAS", 1);
  const budget = valueOrDefault("VFURST_DB_CONNECTION_BUDGET", undefined);
  if (budget === undefined) return { status: "skipped" };
  const demand = limit * (webReplicas + workerReplicas);
  if (demand > budget) {
    return { status: "exceeded", message: `Database pool demand ${demand} exceeds VFURST_DB_CONNECTION_BUDGET=${budget} (${webReplicas} web + ${workerReplicas} worker processes x ${limit}).` };
  }
  return { status: "ok", demand, budget };
}

function startCluster(entryPath, args, count) {
  cluster.schedulingPolicy = cluster.SCHED_RR;
  cluster.setupPrimary({ exec: entryPath, args });
  console.log(`[web-cluster] starting ${count} workers for ${process.argv[2]} (primary pid ${process.pid})`);
  const originalWorkers = new Set();
  const restarts = new Set();
  let aggregatePrinted = false;
  let shuttingDown = false;
  let finalCode = 0;
  let shutdownTimer;
  let exits = [];
  const liveCount = () => Object.keys(cluster.workers ?? {}).length;

  function finish() {
    clearTimeout(shutdownTimer);
    console.log("[web-cluster] all workers exited");
    process.exit(finalCode);
  }

  function shutdown(signal, code) {
    if (shuttingDown) return;
    shuttingDown = true;
    finalCode = code;
    for (const timer of restarts) clearTimeout(timer);
    restarts.clear();
    console.log(`[web-cluster] ${signal}: stopping ${liveCount()} workers`);
    if (liveCount() === 0) { finish(); return; }
    shutdownTimer = setTimeout(() => {
      const remaining = liveCount();
      for (const worker of Object.values(cluster.workers ?? {})) worker.process.kill("SIGKILL");
      console.error(`[web-cluster] shutdown deadline reached; killed ${remaining} workers`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    for (const worker of Object.values(cluster.workers ?? {})) worker.process.kill("SIGTERM");
  }

  process.on("SIGTERM", () => shutdown("SIGTERM", 0));
  process.on("SIGINT", () => shutdown("SIGINT", 0));
  cluster.on("listening", (worker, address) => {
    console.log(`[web-cluster] worker ${worker.id} (pid ${worker.process.pid}) listening on ${address.port}`);
    originalWorkers.delete(worker.id);
    if (!aggregatePrinted && originalWorkers.size === 0) {
      aggregatePrinted = true;
      console.log(`[web-cluster] ${count}/${count} workers listening on ${address.port}`);
    }
  });
  cluster.on("exit", (worker, code, signal) => {
    if (shuttingDown) {
      if (liveCount() === 0) finish();
      return;
    }
    const now = Date.now();
    exits = exits.filter((time) => now - time <= CRASH_WINDOW_MS);
    exits.push(now);
    if (exits.length > MAX_CRASHES_IN_WINDOW) {
      console.error(`[web-cluster] ${exits.length} worker exits in 60s; giving up`);
      shutdown("SIGTERM", 1);
      return;
    }
    console.error(`[web-cluster] worker ${worker.id} (pid ${worker.process.pid}) exited with ${signal ?? code}; restarting in 1s`);
    const timer = setTimeout(() => {
      restarts.delete(timer);
      if (!shuttingDown) cluster.fork();
    }, RESTART_DELAY_MS);
    restarts.add(timer);
  });
  for (let i = 0; i < count; i++) originalWorkers.add(cluster.fork().id);
}

async function main(argv) {
  if (!argv[0]) {
    console.error("Usage: node scripts/web-cluster.mjs <entry> [args...]");
    process.exitCode = 1;
    return;
  }
  const entryPath = resolve(process.cwd(), argv[0]);
  const args = argv.slice(1);
  const count = parseWorkerCount(process.env.VFURST_WEB_REPLICAS);
  const budget = checkConnectionBudget(process.env, count);
  if (budget.status === "exceeded") {
    console.error(`[web-cluster] ${budget.message}`);
    process.exitCode = 1;
    return;
  }
  if (budget.status === "skipped") console.log("[web-cluster] VFURST_DB_CONNECTION_BUDGET is not set; skipping the connection budget check.");
  const parallelism = availableParallelism();
  if (count > parallelism) console.log(`[web-cluster] VFURST_WEB_REPLICAS=${count} exceeds the ${parallelism} available CPUs.`);
  if (count === 1) {
    console.log(`[web-cluster] VFURST_WEB_REPLICAS=1: running ${argv[0]} in this process`);
    process.argv = [process.execPath, entryPath, ...args];
    await import(pathToFileURL(entryPath).href);
  } else {
    startCluster(entryPath, args, count);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[web-cluster] ${error.message}`);
    process.exitCode = 1;
  });
}
