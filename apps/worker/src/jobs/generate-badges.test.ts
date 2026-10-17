import { beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PNG } from "pngjs";

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@aws-sdk/client-s3", () => ({
  GetObjectCommand: class GetObjectCommand {
    constructor(public readonly input: unknown) {}
  },
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

const ORG_ID = "00000000-0000-4000-8000-000000000001";
const EVENT_ID = "00000000-0000-4000-8000-000000000002";
const BADGE_ID = "00000000-0000-4000-8000-000000000101";
const REGISTRATION_ID = "00000000-0000-4000-8000-000000000201";
const TEMPLATE_ID = "00000000-0000-4000-8000-000000000301";

const data: GenerateBadgesJob = {
  orgId: ORG_ID,
  eventId: EVENT_ID,
  templateId: TEMPLATE_ID,
  badgeIds: [BADGE_ID]
};

function testPng() {
  const png = new PNG({ width: 2, height: 2 });
  png.data = Buffer.from([
    0, 0, 0, 255,
    255, 255, 255, 255,
    255, 255, 255, 255,
    0, 0, 0, 255
  ]);
  return PNG.sync.write(png);
}

function badgeRecord(elements: Array<Record<string, unknown>>) {
  return {
    id: BADGE_ID,
    orgId: ORG_ID,
    registrationId: REGISTRATION_ID,
    templateId: TEMPLATE_ID,
    barcodeData: "VF-TEST",
    nfcTag: null,
    pdfUrl: null,
    zplData: null,
    generatedAt: null,
    printedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    registration: {
      id: REGISTRATION_ID,
      orgId: ORG_ID,
      eventId: EVENT_ID,
      portalAccountId: "00000000-0000-4000-8000-000000000401",
      typeId: "00000000-0000-4000-8000-000000000501",
      status: "CONFIRMED",
      checkedInAt: null,
      badgeNumber: null,
      transferredFromId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      event: {
        id: EVENT_ID,
        orgId: ORG_ID,
        name: "Artifact Event"
      },
      type: {
        id: "00000000-0000-4000-8000-000000000501",
        name: "Weekend"
      },
      portalAccount: {
        id: "00000000-0000-4000-8000-000000000401",
        email: "attendee@example.com",
        name: "Artifact Attendee"
      }
    },
    template: {
      id: TEMPLATE_ID,
      layout: {
        width: 360,
        height: 240,
        elements
      }
    }
  };
}

function mockBadges(elements: Array<Record<string, unknown>>) {
  vi.mocked(prisma.badge.findMany).mockResolvedValue([badgeRecord(elements)] as never);
}

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
    mockBadges([
      {
        id: "name",
        type: "text",
        x: 24,
        y: 24,
        w: 240,
        h: 36,
        field: "attendee.name"
      }
    ]);

    const result = await processGenerateBadges({ data } as Job<GenerateBadgesJob>);

    if (!result.zplOutput) throw new Error("Expected persisted ZPL output.");

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
        badgeId: BADGE_ID,
        zpl: expect.stringContaining("Artifact Attendee")
      })
    );
    expect(prisma.badge.update).toHaveBeenCalledWith({
      where: { id: BADGE_ID },
      data: {
        generatedAt: expect.any(Date),
        pdfUrl: result.pdfUrl,
        zplData: result.zplOutput[0]!.zpl
      }
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it("badge name falls back to the portal account email", async () => {
    const badge = badgeRecord([{ id: "name", type: "text", x: 24, y: 24, w: 240, h: 36, field: "attendee.name" }]);
    vi.mocked(prisma.badge.findMany).mockResolvedValue([{ ...badge, registration: { ...badge.registration, portalAccount: { ...badge.registration.portalAccount, name: null } } }] as never);

    const result = await processGenerateBadges({ data } as Job<GenerateBadgesJob>);

    expect(result.zplOutput?.[0]?.zpl).toContain("attendee@example.com");
  });

  it("embeds a tenant-owned PNG in PDF and emits a real ZPL graphic", async () => {
    const assetKey = `${ORG_ID}/event-${EVENT_ID}-badge-assets/logo.png`;
    const png = testPng();
    mockBadges([
      {
        id: "logo",
        type: "image",
        x: 12,
        y: 14,
        w: 16,
        h: 16,
        assetKey
      }
    ]);
    send.mockImplementation(async (command: { input: { Key?: string } }) =>
      command.input.Key === assetKey
        ? {
            Body: { transformToByteArray: async () => png },
            ContentLength: png.byteLength,
            ContentType: "image/png"
          }
        : {}
    );

    const result = await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    const uploadedPdf = (send.mock.calls[1]![0] as { input: { Body: Buffer } }).input.Body;

    expect(result.zplOutput?.[0]?.zpl).toContain("^GFA,32,32,2,");
    expect(result.zplOutput?.[0]?.zpl).not.toContain("IMAGE");
    expect(uploadedPdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(uploadedPdf.toString("latin1")).toContain("/Subtype /Image");
    await expect(PDFDocument.load(uploadedPdf)).resolves.toBeInstanceOf(PDFDocument);
    expect(send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: { Bucket: "badge-test-bucket", Key: assetKey }
      })
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "badge-test-bucket",
          Body: expect.any(Buffer),
          ContentType: "application/pdf"
        })
      })
    );
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("fails the job when an image asset is missing", async () => {
    const assetKey = `${ORG_ID}/event-${EVENT_ID}-badge-assets/missing.png`;
    mockBadges([{ id: "logo", type: "image", x: 0, y: 0, w: 24, h: 24, assetKey }]);
    send.mockRejectedValueOnce(new Error("NoSuchKey"));

    await expect(processGenerateBadges({ data } as Job<GenerateBadgesJob>)).rejects.toThrow(
      `Badge image asset ${assetKey} could not be loaded.`
    );
    expect(prisma.badge.update).not.toHaveBeenCalled();
  });

  it("fails the job when an image body is invalid", async () => {
    const assetKey = `${ORG_ID}/event-${EVENT_ID}-badge-assets/not-an-image.png`;
    mockBadges([{ id: "logo", type: "image", x: 0, y: 0, w: 24, h: 24, assetKey }]);
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => Buffer.from("not an image") },
      ContentLength: 12,
      ContentType: "image/png"
    });

    await expect(processGenerateBadges({ data } as Job<GenerateBadgesJob>)).rejects.toThrow(
      "Badge images must be valid PNG or JPEG files."
    );
    expect(prisma.badge.update).not.toHaveBeenCalled();
  });

  it("rejects an image key owned by a different tenant before reading S3", async () => {
    const assetKey = `00000000-0000-4000-8000-000000000999/event-${EVENT_ID}-badge-assets/logo.png`;
    mockBadges([{ id: "logo", type: "image", x: 0, y: 0, w: 24, h: 24, assetKey }]);

    await expect(processGenerateBadges({ data } as Job<GenerateBadgesJob>)).rejects.toThrow(
      "Badge image layer logo does not reference an asset owned by this organization."
    );
    expect(send).not.toHaveBeenCalled();
    expect(prisma.badge.update).not.toHaveBeenCalled();
  });
});
