import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "@vfurst/db";
import type { Job } from "bullmq";
import type { SendWebhookJob } from "../queues.js";

function signature(secret: string, body: string, timestamp: number) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export async function processSendWebhook(job: Job<SendWebhookJob>) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: {
      orgId: job.data.orgId,
      active: true,
      ...(job.data.endpointId ? { id: job.data.endpointId } : {}),
      events: {
        has: job.data.type
      }
    }
  });

  const deliveries = [];

  for (const endpoint of endpoints) {
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = {
      id: randomUUID(),
      type: job.data.type,
      orgId: job.data.orgId,
      eventId: job.data.eventId,
      createdAt: new Date().toISOString(),
      data: job.data.data
    };
    const body = JSON.stringify(payload);
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "vFurst-webhooks/1.0",
        "x-vfurst-event": job.data.type,
        "x-vfurst-timestamp": String(timestamp),
        "x-vfurst-signature": signature(endpoint.secret, body, timestamp)
      },
      body
    });

    deliveries.push({
      endpointId: endpoint.id,
      url: endpoint.url,
      status: response.status,
      ok: response.ok
    });

    if (!response.ok) {
      throw new Error(`Webhook delivery to ${endpoint.url} failed with HTTP ${response.status}.`);
    }
  }

  return {
    delivered: deliveries.length,
    deliveries
  };
}
