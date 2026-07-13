import { beforeEach, describe, expect, it, vi } from "vitest";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: class PutObjectCommand {
    constructor(public readonly input: unknown) {}
  },
  S3Client: class S3Client {
    send = send;
  }
}));

vi.mock("../env.js", () => ({
  workerEnv: {
    AWS_ACCESS_KEY_ID: "test-key",
    AWS_REGION: "us-east-1",
    AWS_SECRET_ACCESS_KEY: "test-secret",
    AWS_SESSION_TOKEN: undefined,
    S3_BUCKET_NAME: "badge-test-bucket",
    S3_ENDPOINT: undefined,
    S3_PUBLIC_URL: "https://assets.example.com"
  }
}));

vi.mock("@vfurst/db", () => ({
  prisma: {
    badge: {
      findMany: vi.fn(),
      update: vi.fn()
    },
    $transaction: vi.fn()
  }
}));

import { prisma } from "@vfurst/db";
import type { Job } from "bullmq";
import { processGenerateBadges } from "./generate-badges.js";
import type { GenerateBadgesJob } from "../queues.js";

describe("processGenerateBadges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    send.mockResolvedValue({});
    vi.mocked(prisma.badge.update).mockResolvedValue({} as never);
    vi.mocked(prisma.$transaction).mockImplementation(
      (async (operations: readonly Promise<unknown>[]) => Promise.all(operations)) as never
    );
  });

  it("persists reachable PDF and ZPL artifacts only for a consistent tenant event", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000101",
        orgId: "00000000-0000-4000-8000-000000000001",
        registrationId: "00000000-0000-4000-8000-000000000201",
        templateId: "00000000-0000-4000-8000-000000000301",
        barcodeData: "VF-TEST",
        nfcTag: null,
        pdfUrl: null,
        zplData: null,
        generatedAt: null,
        printedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        registration: {
          id: "00000000-0000-4000-8000-000000000201",
          orgId: "00000000-0000-4000-8000-000000000001",
          eventId: "00000000-0000-4000-8000-000000000002",
          userId: "00000000-0000-4000-8000-000000000401",
          typeId: "00000000-0000-4000-8000-000000000501",
          status: "CONFIRMED",
          checkedInAt: null,
          badgeNumber: null,
          transferredFromId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          event: {
            id: "00000000-0000-4000-8000-000000000002",
            orgId: "00000000-0000-4000-8000-000000000001",
            name: "Artifact Event"
          },
          type: {
            id: "00000000-0000-4000-8000-000000000501",
            name: "Weekend"
          },
          user: {
            id: "00000000-0000-4000-8000-000000000401",
            email: "attendee@example.com",
            name: "Artifact Attendee"
          }
        },
        template: {
          id: "00000000-0000-4000-8000-000000000301",
          layout: {
            width: 360,
            height: 240,
            elements: [
              {
                id: "name",
                type: "text",
                x: 24,
                y: 24,
                w: 240,
                h: 36,
                field: "attendee.name"
              }
            ]
          }
        }
      }
    ] as never);

    const data: GenerateBadgesJob = {
      orgId: "00000000-0000-4000-8000-000000000001",
      eventId: "00000000-0000-4000-8000-000000000002",
      templateId: "00000000-0000-4000-8000-000000000301",
      badgeIds: ["00000000-0000-4000-8000-000000000101"]
    };
    const result = await processGenerateBadges({ data } as Job<GenerateBadgesJob>);

    if (!result.zplOutput) {
      throw new Error("Expected persisted ZPL output.");
    }

    expect(prisma.badge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: data.orgId,
          template: { orgId: data.orgId, eventId: data.eventId },
          registration: {
            orgId: data.orgId,
            eventId: data.eventId,
            event: { orgId: data.orgId }
          }
        })
      })
    );
    expect(result.generated).toBe(1);
    expect(result.pdfUrl).toMatch(/^https:\/\/assets\.example\.com\//);
    expect(result.zplOutput[0]).toEqual(
      expect.objectContaining({
        badgeId: data.badgeIds![0],
        zpl: expect.stringContaining("Artifact Attendee")
      })
    );
    expect(prisma.badge.update).toHaveBeenCalledWith({
      where: { id: data.badgeIds![0] },
      data: {
        generatedAt: expect.any(Date),
        pdfUrl: result.pdfUrl,
        zplData: result.zplOutput[0]!.zpl
      }
    });
    expect(send).toHaveBeenCalledOnce();
  });
});
