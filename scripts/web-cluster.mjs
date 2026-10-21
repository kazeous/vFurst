import cluster from "node:cluster";
import { availableParallelism } from "node:os";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  for (let i = 0; i < count; i++) cluster.fork();
  let listening = 0;
  cluster.on("listening", (worker, address) => {
    console.log(`[web-cluster] worker ${worker.id} (pid ${worker.process.pid}) listening on ${address.port}`);
    listening++;
    if (listening === count) console.log(`[web-cluster] ${count}/${count} workers listening on ${address.port}`);
  });
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
