import { randomUUID } from "node:crypto";
import type { WebhookEventType } from "@/lib/webhook-events";
import { webhookQueue, type SendWebhookJob } from "@/lib/webhook-queue";
import { prisma } from "@vfurst/db";

function webhookJob(input: {
  endpointId: string;
  orgId: string;
  type: WebhookEventType;
  eventId?: string;
  data: Record<string, unknown>;
}): SendWebhookJob {
  return {
    deliveryId: randomUUID(),
    createdAt: new Date().toISOString(),
    endpointId: input.endpointId,
    orgId: input.orgId,
    type: input.type,
    eventId: input.eventId,
    data: input.data
  };
}

export async function queueWebhookEvent(input: {
  orgId: string;
  type: WebhookEventType;
  eventId?: string;
  data: Record<string, unknown>;
}) {
  try {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        orgId: input.orgId,
        active: true,
        events: {
          has: input.type
        }
      },
      select: {
        id: true
      }
    });

    if (endpoints.length === 0) {
      return;
    }

    await webhookQueue.addBulk(
      endpoints.map((endpoint) => ({
        name: input.type,
        data: webhookJob({ ...input, endpointId: endpoint.id })
      }))
    );
  } catch {
    // Webhook dispatch is async infrastructure. Domain state changes should not fail when Redis is unavailable.
  }
}

export async function queueWebhookEndpointTest(endpoint: { id: string; orgId: string }) {
  const sentAt = new Date().toISOString();

  await webhookQueue.add(
    "webhook.test",
    webhookJob({
      endpointId: endpoint.id,
      orgId: endpoint.orgId,
      type: "webhook.test",
      data: {
        message: "vFurst webhook test",
        sentAt
      }
    })
  );
}
