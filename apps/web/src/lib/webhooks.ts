import type { WebhookEventType } from "@/lib/webhook-events";
import { webhookQueue, type SendWebhookJob } from "@/lib/webhook-queue";

export async function queueWebhookEvent(input: {
  orgId: string;
  type: WebhookEventType;
  eventId?: string;
  data: Record<string, unknown>;
}) {
  const job: SendWebhookJob = {
    orgId: input.orgId,
    type: input.type,
    eventId: input.eventId,
    data: input.data
  };

  try {
    await webhookQueue.add(input.type, job);
  } catch {
    // Webhook dispatch is async infrastructure. Domain state changes should not fail when Redis is unavailable.
  }
}
