import { beforeEach, describe, expect, it, vi } from "vitest";
import { decodePDFRawStream, PDFDict, PDFDocument, PDFName, PDFPage, PDFRawStream } from "pdf-lib";
import { PNG } from "pngjs";
import bwipjs from "bwip-js/node";
import fontkit, { type Path } from "@pdf-lib/fontkit";

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
const drawText = vi.spyOn(PDFPage.prototype, "drawText");
const drawnTexts = () => drawText.mock.calls.map(([text]) => text);
const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
const nameElements = [
  { id: "name", type: "text", x: 24, y: 24, w: 300, h: 36, field: "attendee.name" },
  { id: "badge", type: "text", x: 24, y: 80, w: 300, h: 36, field: "attendee.badgeName" }
];

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

function badgeRecord(elements: Array<Record<string, unknown>>, overrides: {
  fullName?: string; badgeName?: string | null; barcodeData?: string; id?: string; renderIssue?: string | null;
} = {}) {
  return {
    id: overrides.id ?? BADGE_ID,
    orgId: ORG_ID,
    registrationId: REGISTRATION_ID,
    templateId: TEMPLATE_ID,
    barcodeData: overrides.barcodeData ?? "VF-TEST",
    nfcTag: null,
    pdfUrl: null,
    zplData: null,
    renderIssue: overrides.renderIssue ?? null,
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
      attendeeProfile: {
        fullName: overrides.fullName ?? "Artifact Attendee",
        badgeName: overrides.badgeName === undefined ? "Sam" : overrides.badgeName,
        email: "profile@example.com"
      },
      portalAccount: {
        id: "00000000-0000-4000-8000-000000000401",
        email: "attendee@example.com",
        name: "Account Holder"
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
        zpl: expect.stringMatching(/^\^XA\n\^CI28\n/)
      })
    );
    expect(drawnTexts()).toContain("Artifact Attendee");
    expect(result.zplOutput[0]!.zpl).not.toContain("Artifact Attendee");
    expect(prisma.badge.update).toHaveBeenCalledWith({
      where: { id: BADGE_ID },
      data: {
        generatedAt: expect.any(Date),
        pdfUrl: result.pdfUrl,
        zplData: result.zplOutput[0]!.zpl,
        renderIssue: null
      }
    });
    expect(send).toHaveBeenCalledOnce();
  });

  it("renders the attendee profile's full name", async () => {
    const badge = badgeRecord([{ id: "name", type: "text", x: 24, y: 24, w: 240, h: 36, field: "attendee.name" }]);
    vi.mocked(prisma.badge.findMany).mockResolvedValue([{
      ...badge, registration: { ...badge.registration, attendeeProfile: { ...badge.registration.attendeeProfile, fullName: "Child Attendee" } }
    }] as never);

    await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    expect(drawnTexts()).toContain("Child Attendee");
    expect(drawnTexts()).not.toContain("Account Holder");
    expect(prisma.badge.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({
      registration: { include: expect.objectContaining({ attendeeProfile: { select: { fullName: true, badgeName: true, email: true } } }) }
    }) }));
  });

  it("renders the badge name and falls back to the full name when it is null or blank", async () => {
    for (const badgeName of [" Sam ", null, "", "   "]) {
      drawText.mockClear();
      const badge = badgeRecord([{ id: "name", type: "text", x: 24, y: 24, w: 240, h: 36, field: "attendee.badgeName", value: "SHOULD NOT APPEAR" }]);
      vi.mocked(prisma.badge.findMany).mockResolvedValue([{
        ...badge, registration: { ...badge.registration, attendeeProfile: { ...badge.registration.attendeeProfile, badgeName } }
      }] as never);
      await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
      expect(drawnTexts()).toContain(badgeName?.trim() || "Artifact Attendee");
      expect(drawnTexts()).not.toContain("SHOULD NOT APPEAR");
    }
  });

  it("attendee.email uses the profile email and falls back to the account email", async () => {
    for (const email of ["contact@example.com", null]) {
      const badge = badgeRecord([{ id: "email", type: "text", x: 24, y: 24, w: 240, h: 36, field: "attendee.email" }]);
      vi.mocked(prisma.badge.findMany).mockResolvedValue([{
        ...badge, registration: { ...badge.registration, attendeeProfile: { ...badge.registration.attendeeProfile, email } }
      }] as never);
      await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
      expect(drawnTexts()).toContain(email ?? "attendee@example.com");
    }
  });

  it("renders a Vietnamese full name and badge name", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([badgeRecord([
      { id: "name", type: "text", x: 24, y: 24, w: 300, h: 36, field: "attendee.name" },
      { id: "badge", type: "text", x: 24, y: 80, w: 300, h: 36, field: "attendee.badgeName" }
    ], { fullName: "Nguyễn Thị Ánh Tuyết", badgeName: "Ếch Xanh" })] as never);
    const result = await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    expect(result.generated).toBe(1);
    expect(drawnTexts()).toEqual(["Nguyễn Thị Ánh Tuyết", "Ếch Xanh"]);
    const uploadedPdf = (send.mock.calls[0]![0] as { input: { Body: Buffer } }).input.Body;
    const doc = await PDFDocument.load(uploadedPdf);
    const dictionaries = doc.context.enumerateIndirectObjects().map(([, object]) => object)
      .filter((object): object is PDFDict => object instanceof PDFDict);
    const fontDictionaries = dictionaries.filter((object) => object.get(PDFName.of("Type")) === PDFName.of("Font"));
    expect(fontDictionaries.length).toBeGreaterThan(0);
    for (const dictionary of fontDictionaries) {
      const baseFont = dictionary.get(PDFName.of("BaseFont"))!.toString();
      expect(baseFont).toMatch(/^\/NotoSans-Regular-\d+$/);
      expect(baseFont).not.toContain("Helvetica");
    }
    const fontFiles = dictionaries.filter((object) => object.get(PDFName.of("Type")) === PDFName.of("FontDescriptor"))
      .map((object) => object.get(PDFName.of("FontFile2"))).filter((object) => object !== undefined);
    expect(fontFiles.length).toBeGreaterThan(0);
    for (const fontFile of fontFiles) {
      const stream = doc.context.lookup(fontFile);
      if (!(stream instanceof PDFRawStream)) throw new Error("Expected an embedded font stream.");
      expect(decodePDFRawStream(stream).decode().length).toBeLessThan(100_000);
      const embedded = fontkit.create(Buffer.from(decodePDFRawStream(stream).decode()));
      for (let gid = 0; gid < embedded.numGlyphs; gid += 1) {
        expect(() => (embedded.getGlyph(gid).path as Path & { commands: unknown[] }).commands, `embedded glyph ${gid}`).not.toThrow();
      }
    }
    expect(result.zplOutput?.[0]?.zpl.startsWith("^XA\n^CI28\n")).toBe(true);
    expect(result.zplOutput?.[0]?.zpl.match(/\^GFA,/g)).toHaveLength(2);
  });

  it("draws NFC text for decomposed input", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([badgeRecord([
      { id: "name", type: "text", x: 24, y: 24, w: 300, h: 36, field: "attendee.name" }
    ], { fullName: "Nguyễn Thị Ánh Tuyết".normalize("NFD") })] as never);
    await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    expect(drawnTexts()).toEqual(["Nguyễn Thị Ánh Tuyết"]);
  });

  it("keeps the starter template's positions and sizes", async () => {
    mockBadges([
      { id: "event", type: "text", x: 24, y: 22, w: 312, h: 30, field: "event.name" },
      { id: "name", type: "text", x: 24, y: 82, w: 220, h: 36, field: "attendee.name" },
      { id: "type", type: "text", x: 24, y: 126, w: 180, h: 24, field: "registration.type" },
      { id: "qr", type: "qr", x: 252, y: 78, w: 72, h: 72, field: "registration.badgeNumber" }
    ]);
    const result = await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    expect(drawText).toHaveBeenCalledWith("Artifact Event", expect.objectContaining({ x: 24, y: 195.5, size: expect.closeTo(16.5, 5) }));
    expect(drawText).toHaveBeenCalledWith("Artifact Attendee", expect.objectContaining({ x: 24, y: 131, size: expect.closeTo(19.8, 5) }));
    expect(drawText).toHaveBeenCalledWith("Weekend", expect.objectContaining({ x: 24, y: 96, size: expect.closeTo(13.2, 5) }));
    for (const origin of ["^FO24,22\n", "^FO24,82\n", "^FO24,126\n", "^FO252,78\n^BQN,2,5^FH^FDLA,VF-TEST^FS"]) expect(result.zplOutput?.[0]?.zpl).toContain(origin);
  });

  it("uses barcodeData for an empty barcode value in both outputs", async () => {
    mockBadges([{ id: "bc", type: "barcode", x: 32, y: 160, w: 180, h: 42 }]);
    const result = await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    expect(result.zplOutput?.[0]?.zpl).toContain("^BCN,42,Y,N,N^FH^FDVF-TEST^FS");
  });

  it("falls back to the full name when the badge name has nothing printable", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([badgeRecord([
      { id: "name", type: "text", x: 24, y: 24, w: 300, h: 36, field: "attendee.badgeName" }
    ], { badgeName: "🦊🦊" })] as never);
    await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    expect(drawnTexts()).toEqual(["Artifact Attendee"]);
  });

  it("falls back to the full name for an invisible-only badge name", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([badgeRecord([
      { id: "name", type: "text", x: 24, y: 24, w: 300, h: 36, field: "attendee.badgeName" }
    ], { badgeName: "​ " })] as never);
    await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    expect(drawnTexts()).toEqual(["Artifact Attendee"]);
  });

  it("cuts a long unbroken name with an ellipsis", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([badgeRecord([
      { id: "name", type: "text", x: 24, y: 24, w: 300, h: 36, field: "attendee.name" }
    ], { fullName: "W".repeat(120) })] as never);
    await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    expect(drawnTexts()[0]?.endsWith("…")).toBe(true);
    expect(drawText.mock.calls[0]?.[1]?.size).toEqual(expect.closeTo(11.88, 5));
  });

  it("isolates a badge with nothing printable and saves the rest", async () => {
    const ids = [BADGE_ID, "00000000-0000-4000-8000-000000000102", "00000000-0000-4000-8000-000000000103"];
    vi.mocked(prisma.badge.findMany).mockResolvedValue([
      badgeRecord(nameElements, { id: ids[0], barcodeData: "VF-A", fullName: "Nguyễn Văn An", badgeName: "An" }),
      badgeRecord(nameElements, { id: ids[1], barcodeData: "VF-B", fullName: "Aurora Fox", badgeName: "🦊🦊" }),
      badgeRecord(nameElements, { id: ids[2], barcodeData: "VF-C", fullName: "山田太郎", badgeName: null })
    ] as never);
    const result = await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    const reason = "Nothing printable in attendee.name (山田太郎).";
    expect(result.generated).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([{ badgeId: ids[2], reason }]);
    const uploadedPdf = (send.mock.calls[0]![0] as { input: { Body: Buffer } }).input.Body;
    expect((await PDFDocument.load(uploadedPdf)).getPageCount()).toBe(2);
    for (const [index, renderIssue] of [[0, null], [1, "Printed without: 🦊"]] as const) {
      expect(prisma.badge.update).toHaveBeenCalledWith({ where: { id: ids[index] }, data: {
        generatedAt: expect.any(Date), pdfUrl: result.pdfUrl, zplData: expect.any(String), renderIssue
      } });
    }
    expect(prisma.badge.update).toHaveBeenCalledWith({ where: { id: ids[2] }, data: {
      generatedAt: null, pdfUrl: null, zplData: null, renderIssue: reason
    } });
    expect(warn).toHaveBeenCalledExactlyOnceWith(`[worker:badge] badge ${ids[2]} not rendered (element name, attendee.name)`);
    expect(warn.mock.calls.flat().join(" ")).not.toContain("山");
  });

  it("isolates a barcode the encoder rejects", async () => {
    const elements = [{ id: "code", type: "barcode", field: "registration.badgeNumber", x: 32, y: 160, w: 180, h: 42 }];
    vi.mocked(prisma.badge.findMany).mockResolvedValue([
      badgeRecord(elements, { barcodeData: "VF-A" }),
      badgeRecord(elements, { id: "00000000-0000-4000-8000-000000000102", barcodeData: "VF-B" })
    ] as never);
    vi.spyOn(bwipjs, "toBuffer").mockRejectedValueOnce(new Error("bwipp.code128badCharacter."));
    const result = await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    expect(result.generated).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures).toEqual([{ badgeId: BADGE_ID, reason: "registration.badgeNumber layer code: bwipp.code128badCharacter." }]);
    const uploadedPdf = (send.mock.calls[0]![0] as { input: { Body: Buffer } }).input.Body;
    expect((await PDFDocument.load(uploadedPdf)).getPageCount()).toBe(1);
  });

  it("cuts the original text in a reason to 40 graphemes", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([badgeRecord(nameElements, { fullName: "山".repeat(50) })] as never);
    const result = await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    expect(result.failures).toEqual([{ badgeId: BADGE_ID, reason: `Nothing printable in attendee.name (${"山".repeat(40)}).` }]);
  });

  it("completes without uploading when every badge fails", async () => {
    const badges = [badgeRecord(nameElements, { fullName: "山田太郎", barcodeData: "VF-A" }),
      badgeRecord(nameElements, { id: "00000000-0000-4000-8000-000000000102", fullName: "山田花子", barcodeData: "VF-B" })];
    vi.mocked(prisma.badge.findMany).mockResolvedValue(badges as never);
    await expect(processGenerateBadges({ data } as Job<GenerateBadgesJob>)).resolves.toEqual(expect.objectContaining({
      generated: 0, failed: 2, pdfUrl: null, zplOutput: []
    }));
    expect(send).not.toHaveBeenCalled();
    for (const badge of badges) {
      expect(prisma.badge.update).toHaveBeenCalledWith({ where: { id: badge.id }, data: {
        generatedAt: null, pdfUrl: null, zplData: null, renderIssue: `Nothing printable in attendee.name (${badge.registration.attendeeProfile.fullName}).`
      } });
    }
  });

  it("clears an earlier issue when a badge renders cleanly", async () => {
    vi.mocked(prisma.badge.findMany).mockResolvedValue([badgeRecord(nameElements, { renderIssue: "Nothing printable in attendee.name (x)." })] as never);
    await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    expect(prisma.badge.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ renderIssue: null }) }));
  });

  it("cuts long reasons to 500 characters", async () => {
    mockBadges([{ id: "code", type: "barcode", field: "registration.badgeNumber", x: 32, y: 160, w: 180, h: 42 }]);
    vi.spyOn(bwipjs, "toBuffer").mockRejectedValueOnce(new Error("x".repeat(600)));
    const result = await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    expect(result.failures[0]?.reason).toHaveLength(500);
    expect(vi.mocked(prisma.badge.update).mock.calls[0]?.[0].data.renderIssue).toHaveLength(500);
  });

  it("lists at most ten dropped characters", async () => {
    const emoji = ["🦊", "🐱", "🐶", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵"];
    vi.mocked(prisma.badge.findMany).mockResolvedValue([badgeRecord(nameElements, { badgeName: emoji.join("") + " Sam" })] as never);
    await processGenerateBadges({ data } as Job<GenerateBadgesJob>);
    expect(prisma.badge.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      renderIssue: "Printed without: " + emoji.slice(0, 10).join(" ") + " …"
    }) }));
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
