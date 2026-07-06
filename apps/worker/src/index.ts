import { Worker } from "bullmq";
import { createServer } from "node:http";
import { connection } from "./queues";
import { processSendEmail } from "./jobs/send-email";

const workers = [
  new Worker("email", processSendEmail, {
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
