import { Worker } from "bullmq";
import { createServer } from "node:http";
import { connection, reconcileQueue } from "./queues";
import { processGenerateBadges } from "./jobs/generate-badges";
import { processReconcileFees } from "./jobs/reconcile-fees";
import { processSendEmail } from "./jobs/send-email";
import { processSendWebhook } from "./jobs/send-webhook";

const workers = [
  new Worker("email", processSendEmail, {
    connection
  }),
  new Worker("badge", processGenerateBadges, {
    connection
  }),
  new Worker("reconcile", processReconcileFees, {
    connection
  }),
  new Worker("webhook", processSendWebhook, {
    connection
  })
];

const healthServer = createServer((_request, response) => {
  response.writeHead(200, {
    "content-type": "application/json"
  });
  response.end(JSON.stringify({ ok: true, workers: workers.length }));
});

const port = Number(process.env.WORKER_HEALTH_PORT ?? 3001);
healthServer.listen(port, "0.0.0.0");

void reconcileQueue
  .add(
    "reconcile-fees",
    {},
    {
      jobId: "nightly-fee-reconciliation",
      repeat: {
        pattern: "0 6 * * *"
      }
    }
  )
  .catch(() => {
    // The worker can still process explicitly queued jobs if repeat scheduling is unavailable at startup.
  });

async function shutdown() {
  await Promise.all(workers.map((worker) => worker.close()));
  healthServer.close();
}

process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
