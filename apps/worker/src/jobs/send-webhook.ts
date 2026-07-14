import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "@vfurst/db";
import type { Job } from "bullmq";
import type { SendWebhookJob } from "../queues.js";
import { postWebhook } from "../lib/webhook-http.js";
import { resolveWebhookTarget } from "../lib/webhook-target.js";

function signature(secret: string, body: string, timestamp: number) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export async function processSendWebhook(job: Job<SendWebhookJob>) {
  if (!job.data.endpointId) {
    return {
      delivered: 0,
      skipped: "Webhook job did not identify a tenant-bound endpoint."
    };
  }

  const endpoint = await prisma.webhookEndpoint.findFirst({
    where: {
      id: job.data.endpointId,
      orgId: job.data.orgId,
      ...(job.data.type === "webhook.test"
        ? {}
        : {
            active: true,
            events: {
              has: job.data.type
            }
          })
    }
  });

  if (!endpoint) {
    return {
      delivered: 0,
      skipped: "Webhook endpoint is unavailable, inactive, unsubscribed, or belongs to another tenant."
    };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const payload = {
    id: job.data.deliveryId ?? (job.id ? String(job.id) : randomUUID()),
    type: job.data.type,
    orgId: endpoint.orgId,
    eventId: job.data.eventId,
    createdAt: job.data.createdAt ?? new Date(job.timestamp).toISOString(),
    data: job.data.data
  };
  const body = JSON.stringify(payload);
  const target = await resolveWebhookTarget(endpoint.url);
  const response = await postWebhook(
    target,
    {
      "content-type": "application/json",
      "user-agent": "vFurst-webhooks/1.0",
      "x-vfurst-event": job.data.type,
      "x-vfurst-timestamp": String(timestamp),
      "x-vfurst-signature": signature(endpoint.secret, body, timestamp)
    },
    body
  );

  if (!response.ok) {
    throw new Error(`Webhook delivery failed with HTTP ${response.status}.`);
  }

  return {
    delivered: 1,
    deliveries: [
      {
        endpointId: endpoint.id,
        url: endpoint.url,
        status: response.status,
        ok: response.ok
      }
    ]
  };
}
