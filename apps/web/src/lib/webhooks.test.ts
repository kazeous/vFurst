import { beforeEach, describe, expect, it, vi } from "vitest";

const { add, addBulk } = vi.hoisted(() => ({
  add: vi.fn(),
  addBulk: vi.fn()
}));

vi.mock("@/lib/webhook-queue", () => ({
  webhookQueue: { add, addBulk }
}));
vi.mock("@vfurst/db", () => ({
  prisma: {
    webhookEndpoint: {
      findMany: vi.fn()
    }
  }
}));

import { prisma } from "@vfurst/db";
import { queueWebhookEndpointTest, queueWebhookEvent } from "@/lib/webhooks";

describe("webhook queueing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fans out one retry-stable job per subscribed tenant endpoint", async () => {
    vi.mocked(prisma.webhookEndpoint.findMany).mockResolvedValue([
      { id: "00000000-0000-4000-8000-000000000101" },
      { id: "00000000-0000-4000-8000-000000000102" }
    ] as never);

    await queueWebhookEvent({
      orgId: "00000000-0000-4000-8000-000000000001",
      eventId: "00000000-0000-4000-8000-000000000201",
      type: "order.paid",
      data: { orderId: "00000000-0000-4000-8000-000000000301" }
    });

    expect(prisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
      where: {
        orgId: "00000000-0000-4000-8000-000000000001",
        active: true,
        events: { has: "order.paid" }
      },
      select: { id: true }
    });
    expect(addBulk).toHaveBeenCalledOnce();
    const jobs = vi.mocked(addBulk).mock.calls[0]![0] as Array<{
      data: { createdAt: string; deliveryId: string; endpointId: string; orgId: string };
      name: string;
    }>;

    expect(jobs).toHaveLength(2);
    expect(jobs.map((job) => job.data.endpointId)).toEqual([
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000102"
    ]);
    expect(jobs.every((job) => job.name === "order.paid")).toBe(true);
    expect(new Set(jobs.map((job) => job.data.deliveryId)).size).toBe(2);
    expect(jobs.every((job) => Boolean(Date.parse(job.data.createdAt)))).toBe(true);
  });

  it("does not create empty fan-out jobs", async () => {
    vi.mocked(prisma.webhookEndpoint.findMany).mockResolvedValue([]);

    await queueWebhookEvent({
      orgId: "00000000-0000-4000-8000-000000000001",
      type: "registration.created",
      data: {}
    });

    expect(addBulk).not.toHaveBeenCalled();
  });

  it("queues an explicit test for exactly the authorized endpoint", async () => {
    await queueWebhookEndpointTest({
      id: "00000000-0000-4000-8000-000000000101",
      orgId: "00000000-0000-4000-8000-000000000001"
    });

    expect(add).toHaveBeenCalledWith(
      "webhook.test",
      expect.objectContaining({
        endpointId: "00000000-0000-4000-8000-000000000101",
        orgId: "00000000-0000-4000-8000-000000000001",
        type: "webhook.test",
        deliveryId: expect.any(String),
        createdAt: expect.any(String)
      })
    );
  });
});
