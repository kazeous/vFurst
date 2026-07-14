import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { postWebhook, resolveWebhookTarget } = vi.hoisted(() => ({
  postWebhook: vi.fn(),
  resolveWebhookTarget: vi.fn()
}));

vi.mock("../lib/webhook-http.js", () => ({ postWebhook }));
vi.mock("../lib/webhook-target.js", () => ({ resolveWebhookTarget }));
vi.mock("@vfurst/db", () => ({
  prisma: {
    webhookEndpoint: {
      findFirst: vi.fn()
    }
  }
}));

import { prisma } from "@vfurst/db";
import type { Job } from "bullmq";
import type { SendWebhookJob } from "../queues.js";
import { processSendWebhook } from "./send-webhook.js";

const endpoint = {
  id: "00000000-0000-4000-8000-000000000101",
  orgId: "00000000-0000-4000-8000-000000000001",
  url: "https://hooks.example.com/vfurst",
  events: ["order.paid"],
  secret: "whsec_test-signing-secret-1234567890",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("processSendWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveWebhookTarget).mockResolvedValue({
      address: "93.184.216.34",
      hostname: "hooks.example.com",
      url: new URL(endpoint.url)
    });
    vi.mocked(postWebhook).mockResolvedValue({ ok: true, status: 204 });
  });

  it("loads one tenant-bound endpoint and signs a retry-stable delivery envelope", async () => {
    vi.mocked(prisma.webhookEndpoint.findFirst).mockResolvedValue(endpoint);
    const data: SendWebhookJob = {
      deliveryId: "00000000-0000-4000-8000-000000000201",
      createdAt: "2026-07-14T01:02:03.000Z",
      orgId: endpoint.orgId,
      endpointId: endpoint.id,
      type: "order.paid",
      eventId: "00000000-0000-4000-8000-000000000301",
      data: { orderId: "00000000-0000-4000-8000-000000000401" }
    };

    const result = await processSendWebhook({ data, id: "42", timestamp: Date.now() } as Job<SendWebhookJob>);

    expect(prisma.webhookEndpoint.findFirst).toHaveBeenCalledWith({
      where: {
        id: endpoint.id,
        orgId: endpoint.orgId,
        active: true,
        events: { has: "order.paid" }
      }
    });
    expect(resolveWebhookTarget).toHaveBeenCalledWith(endpoint.url);
    expect(postWebhook).toHaveBeenCalledOnce();

    const [, headers, body] = vi.mocked(postWebhook).mock.calls[0]!;
    const parsedBody = JSON.parse(body) as { id: string; createdAt: string; orgId: string };
    const timestamp = Number(headers["x-vfurst-timestamp"]);
    const expectedSignature = createHmac("sha256", endpoint.secret).update(`${timestamp}.${body}`).digest("hex");

    expect(parsedBody).toMatchObject({
      id: data.deliveryId,
      createdAt: data.createdAt,
      orgId: endpoint.orgId
    });
    expect(headers["x-vfurst-signature"]).toBe(expectedSignature);
    expect(result.delivered).toBe(1);
  });

  it("does not deliver when the endpoint ID is absent from the submitted tenant", async () => {
    vi.mocked(prisma.webhookEndpoint.findFirst).mockResolvedValue(null);
    const data: SendWebhookJob = {
      deliveryId: "00000000-0000-4000-8000-000000000202",
      createdAt: "2026-07-14T01:02:03.000Z",
      orgId: endpoint.orgId,
      endpointId: "00000000-0000-4000-8000-000000000999",
      type: "order.paid",
      data: {}
    };

    const result = await processSendWebhook({ data, id: "43", timestamp: Date.now() } as Job<SendWebhookJob>);

    expect(result.delivered).toBe(0);
    expect(postWebhook).not.toHaveBeenCalled();
  });

  it("allows an authorized test job to exercise a paused or unsubscribed endpoint", async () => {
    vi.mocked(prisma.webhookEndpoint.findFirst).mockResolvedValue({ ...endpoint, active: false, events: [] });
    const data: SendWebhookJob = {
      deliveryId: "00000000-0000-4000-8000-000000000203",
      createdAt: "2026-07-14T01:02:03.000Z",
      orgId: endpoint.orgId,
      endpointId: endpoint.id,
      type: "webhook.test",
      data: { message: "test" }
    };

    await processSendWebhook({ data, id: "44", timestamp: Date.now() } as Job<SendWebhookJob>);

    expect(prisma.webhookEndpoint.findFirst).toHaveBeenCalledWith({
      where: {
        id: endpoint.id,
        orgId: endpoint.orgId
      }
    });
    expect(postWebhook).toHaveBeenCalledOnce();
  });
});
