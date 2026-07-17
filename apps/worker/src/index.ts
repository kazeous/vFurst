import { prisma } from "@vfurst/db";
import { QUEUE_JOB_NAMES } from "@vfurst/contracts";
import { QueueEvents, Worker } from "bullmq";
import { Redis } from "ioredis";
import { createServer, type Server } from "node:http";
import { workerEnv, requiredWorkerRuntimeVariables } from "./env.js";
import { allQueues, connection, queueNames, reconcileQueue } from "./queues.js";
import {
  createControlPlaneEventProcessor,
  createRedisControlPlaneVersionStore,
  prismaControlPlaneConsumerRepository
} from "./jobs/apply-control-plane-event.js";
import { processDispatchControlPlaneEvents } from "./jobs/dispatch-control-plane-events.js";
import { processGenerateBadges } from "./jobs/generate-badges.js";
import { processReconcileFees } from "./jobs/reconcile-fees.js";
import { processReconcileSePay } from "./jobs/reconcile-sepay.js";
import { processExpireCheckouts } from "./jobs/expire-checkouts.js";
import { processSendEmail } from "./jobs/send-email.js";
import { processSendWebhook } from "./jobs/send-webhook.js";
import { processRecoverEmailDeliveries } from "./jobs/recover-email-deliveries.js";

const controlPlaneRedis = new Redis(workerEnv.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null
});
const processControlPlaneEvent = createControlPlaneEventProcessor({
  repository: prismaControlPlaneConsumerRepository,
  versionStore: createRedisControlPlaneVersionStore(
    controlPlaneRedis,
    workerEnv.CONTROL_PLANE_INVALIDATION_CHANNEL
  )
});

let workers: Worker[] = [];
let queueEvents: QueueEvents[] = [];
let healthServer: Server | null = null;
let shutdownPromise: Promise<void> | null = null;

function createWorkers() {
  return [
    new Worker("email", processSendEmail, {
      connection
    }),
    new Worker("badge", processGenerateBadges, {
      connection
    }),
    new Worker(
      "reconcile",
      (job) =>
        job.name === "reconcile-sepay"
          ? processReconcileSePay()
          : job.name === "expire-checkouts"
            ? processExpireCheckouts()
            : job.name === "recover-email-deliveries"
              ? processRecoverEmailDeliveries()
              : job.name === QUEUE_JOB_NAMES.dispatchControlPlaneEvents
                ? processDispatchControlPlaneEvents()
            : processReconcileFees(job),
      {
      connection
    }),
    new Worker("webhook", processSendWebhook, {
      connection
    }),
    new Worker("control-plane", processControlPlaneEvent, {
      connection
    })
  ];
}

function createQueueEvents() {
  return queueNames.map((queueName) => {
    const events = new QueueEvents(queueName, {
      connection
    });

    events.on("failed", ({ jobId, failedReason }) => {
      console.error(`[worker:${queueName}] job ${jobId} failed: ${failedReason}`);
    });

    events.on("error", (error) => {
      console.error(`[worker:${queueName}] queue events error`, error);
    });

    return events;
  });
}

function attachWorkerLogging(worker: Worker) {
  worker.on("completed", (job) => {
    console.info(`[worker:${worker.name}] job ${job.id ?? "unknown"} completed`);
  });

  worker.on("failed", (job, error) => {
    console.error(`[worker:${worker.name}] job ${job?.id ?? "unknown"} failed`, error);
  });

  worker.on("error", (error) => {
    console.error(`[worker:${worker.name}] worker error`, error);
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function listenHealthServer() {
  const port = workerEnv.WORKER_HEALTH_PORT;

  if (!port) {
    return Promise.resolve();
  }

  healthServer = createServer((_request, response) => {
    const acceptingJobs =
      !shutdownPromise &&
      controlPlaneRedis.status === "ready" &&
      workers.every((worker) => worker.isRunning() && !worker.isPaused());

    response.writeHead(acceptingJobs ? 200 : 503, {
      "content-type": "application/json"
    });
    response.end(
      JSON.stringify({
        ok: acceptingJobs,
        workers: workers.length,
        queues: queueNames
      })
    );
  });

  return new Promise<void>((resolve, reject) => {
    const server = healthServer;

    if (!server) {
      resolve();
      return;
    }

    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => {
      server.off("error", reject);
      console.info(`Worker health endpoint listening on port ${port}.`);
      resolve();
    });
  });
}

function closeHealthServer() {
  if (!healthServer) {
    return Promise.resolve();
  }

  const server = healthServer;
  healthServer = null;

  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function scheduleRecurringJobs() {
  await reconcileQueue.add(
    "reconcile-fees",
    {},
    {
      jobId: "nightly-fee-reconciliation",
      repeat: {
        pattern: "0 6 * * *"
      }
    }
  );
  await reconcileQueue.add(
    "reconcile-sepay",
    {},
    {
      jobId: "sepay-transaction-reconciliation",
      repeat: {
        pattern: "*/15 * * * *"
      }
    }
  );
  await reconcileQueue.add(
    "expire-checkouts",
    {},
    {
      jobId: "expire-pending-checkouts",
      repeat: {
        pattern: "* * * * *"
      }
    }
  );
  await reconcileQueue.add(
    "recover-email-deliveries",
    {},
    {
      jobId: "recover-email-deliveries",
      repeat: {
        pattern: "* * * * *"
      }
    }
  );
  await reconcileQueue.add(
    QUEUE_JOB_NAMES.dispatchControlPlaneEvents,
    {},
    {
      jobId: "dispatch-control-plane-events",
      repeat: {
        pattern: "* * * * *"
      }
    }
  );
}

async function start() {
  console.info(`Worker runtime environment validated. Required variables: ${requiredWorkerRuntimeVariables.join(", ")}.`);

  await withTimeout(
    Promise.all([prisma.$connect(), controlPlaneRedis.connect()]),
    workerEnv.WORKER_STARTUP_TIMEOUT_MS,
    "Timed out while connecting to the database or control-plane Redis during worker startup."
  );

  workers = createWorkers();
  workers.forEach(attachWorkerLogging);
  queueEvents = createQueueEvents();

  await withTimeout(
    Promise.all([
      ...workers.map((worker) => worker.waitUntilReady()),
      ...queueEvents.map((events) => events.waitUntilReady()),
      ...allQueues.map((queue) => queue.waitUntilReady())
    ]),
    workerEnv.WORKER_STARTUP_TIMEOUT_MS,
    "Timed out while connecting to Redis during worker startup."
  );

  await scheduleRecurringJobs();
  await processRecoverEmailDeliveries();
  await processDispatchControlPlaneEvents();
  await listenHealthServer();

  console.info(`vFurst worker started. Processing queues: ${queueNames.join(", ")}.`);
}

async function performShutdown(reason: string) {
  console.info(`Worker shutting down (${reason}).`);

  await closeHealthServer();
  await Promise.allSettled(workers.map((worker) => worker.pause(true)));
  await Promise.all(workers.map((worker) => worker.close(false)));
  await Promise.all(queueEvents.map((events) => events.close()));
  await Promise.all(allQueues.map((queue) => queue.close()));
  await controlPlaneRedis.quit();
  await prisma.$disconnect();

  console.info("Worker shutdown complete.");
}

function shutdown(reason: string) {
  shutdownPromise ??= performShutdown(reason);
  return shutdownPromise;
}

function exitAfterShutdown(reason: string, exitCode: number) {
  void shutdown(reason)
    .then(() => {
      process.exit(exitCode);
    })
    .catch((error) => {
      console.error("Worker shutdown failed.", error);
      process.exit(1);
    });
}

process.once("SIGTERM", () => {
  exitAfterShutdown("SIGTERM", 0);
});

process.once("SIGINT", () => {
  exitAfterShutdown("SIGINT", 0);
});

process.once("uncaughtException", (error) => {
  console.error("Uncaught worker exception.", error);
  exitAfterShutdown("uncaughtException", 1);
});

process.once("unhandledRejection", (reason) => {
  console.error("Unhandled worker rejection.", reason);
  exitAfterShutdown("unhandledRejection", 1);
});

start().catch((error) => {
  console.error("Worker failed to start.", error);
  exitAfterShutdown("startup failure", 1);
});
