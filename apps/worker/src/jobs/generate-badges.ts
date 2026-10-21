import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { prisma } from "@vfurst/db";
import bwipjs from "bwip-js/node";
import type { Job } from "bullmq";
import fontkit from "@pdf-lib/fontkit";
import jpeg from "jpeg-js";
import { PDFDocument, rgb } from "pdf-lib";
import { PNG } from "pngjs";
import { workerEnv } from "../env.js";
import type { GenerateBadgesJob } from "../queues.js";
import type { BadgeContent, BadgeElement, BadgeLayout, RasterImage } from "../badges/types.js";
import { loadBadgeFonts, type BadgeFonts } from "../badges/fonts.js";
import { prepareBadgeText } from "../badges/badge-text.js";
import { fitBadgeText, measureWith } from "../badges/text-layout.js";
import { toZpl } from "../badges/zpl.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096;
const MAX_IMAGE_PIXELS = 16_000_000;

const s3Client = new S3Client({
  region: workerEnv.AWS_REGION,
  endpoint: workerEnv.S3_ENDPOINT,
  forcePathStyle: Boolean(workerEnv.S3_ENDPOINT),
  credentials: {
    accessKeyId: workerEnv.AWS_ACCESS_KEY_ID,
    secretAccessKey: workerEnv.AWS_SECRET_ACCESS_KEY,
    sessionToken: workerEnv.AWS_SESSION_TOKEN
  }
});

function parseLayout(value: unknown): BadgeLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Badge template layout is invalid.");
  }

  const layout = value as Partial<BadgeLayout>;

  if (typeof layout.width !== "number" || typeof layout.height !== "number" || !Array.isArray(layout.elements)) {
    throw new Error("Badge template layout is missing width, height, or elements.");
  }

  return layout as BadgeLayout;
}

function resolveField(field: string | undefined, badge: Awaited<ReturnType<typeof loadBadges>>[number]) {
  switch (field) {
    case "attendee.name":
      return badge.registration.attendeeProfile.fullName;
    case "attendee.badgeName":
      return badge.registration.attendeeProfile.badgeName?.trim() || badge.registration.attendeeProfile.fullName;
    case "attendee.email":
      return badge.registration.attendeeProfile.email ?? badge.registration.portalAccount.email;
    case "registration.type":
      return badge.registration.type.name;
    case "registration.badgeNumber":
      return badge.registration.badgeNumber ?? badge.barcodeData;
    case "event.name":
      return badge.registration.event.name;
    default:
      return "";
  }
}

function renderValue(element: BadgeElement, badge: Awaited<ReturnType<typeof loadBadges>>[number]) {
  const fieldValue = resolveField(element.field, badge);
  return fieldValue || element.value?.replace(/\{\{|\}\}/g, "") || "";
}

export class BadgeRenderError extends Error {
  constructor(readonly elementId: string, readonly field: string, readonly reason: string) {
    super(reason);
    this.name = "BadgeRenderError";
  }
}

function asBadgeRenderError(element: BadgeElement, error: unknown): BadgeRenderError {
  if (error instanceof BadgeRenderError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new BadgeRenderError(element.id ?? "(unnamed)", element.field ?? element.type,
    `${element.field ?? element.type} layer ${element.id ?? "(unnamed)"}: ${message.replace(/\.+$/, "")}.`.slice(0, 500));
}

function resolveBadgeContent(
  layout: BadgeLayout,
  badge: Awaited<ReturnType<typeof loadBadges>>[number],
  fonts: BadgeFonts,
  imageAssets: Map<BadgeElement, RasterImage>
): BadgeContent {
  const dropped = new Set<string>();
  const elements: BadgeContent["elements"] = [];
  const prepare = (value: string) => {
    const result = prepareBadgeText(value, [fonts.pdf, fonts.zpl]);
    for (const character of result.dropped) dropped.add(character);
    return result.text;
  };
  for (const element of layout.elements) {
    try {
      if (element.type === "image") {
        const image = imageAssets.get(element);
        if (!image) throw new Error(`Badge image layer ${element.id ?? "(unnamed)"} was not loaded.`);
        elements.push({ kind: "image", element, image });
      } else if (element.type === "barcode" || element.type === "qr") {
        elements.push({ kind: "code", element, data: renderValue(element, badge) || badge.barcodeData });
      } else {
        let source = renderValue(element, badge);
        let text: string;
        if (element.field === "attendee.badgeName") {
          source = badge.registration.attendeeProfile.badgeName?.trim() ?? "";
          text = prepare(source);
          if (!text) {
            source = badge.registration.attendeeProfile.fullName;
            text = prepare(source);
          }
        } else {
          text = prepare(source);
        }
        if (source && !text) {
          const original = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(source.normalize("NFC")), ({ segment }) => segment).slice(0, 40).join("");
          throw new BadgeRenderError(element.id ?? "(unnamed)", element.field ?? "text",
            `Nothing printable in ${element.field ?? "text"} (${original}).`.slice(0, 500));
        }
        elements.push({ kind: "text", element, text });
      }
    } catch (error) {
      throw asBadgeRenderError(element, error);
    }
  }
  return { elements, dropped: [...dropped] };
}

async function barcodePng(text: string, type: "barcode" | "qr") {
  return type === "qr"
    ? bwipjs.toBuffer({
        bcid: "qrcode",
        text,
        scale: 3
      })
    : bwipjs.toBuffer({
        bcid: "code128",
        text,
        scale: 3,
        height: 12,
        includetext: true
      });
}

function requireTenantAssetKey(element: BadgeElement, orgId: string) {
  const key = element.assetKey?.trim().replace(/^\/+/, "");

  if (!key) {
    throw new Error(`Badge image layer ${element.id ?? "(unnamed)"} is missing an asset key.`);
  }

  const segments = key.split("/");
  if (
    !key.startsWith(`${orgId}/`) ||
    key.includes("\\") ||
    Array.from(key).some((character) => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`Badge image layer ${element.id ?? "(unnamed)"} does not reference an asset owned by this organization.`);
  }

  return key;
}

async function readObjectBody(body: unknown) {
  if (body && typeof body === "object" && "transformToByteArray" in body) {
    const transform = (body as { transformToByteArray?: unknown }).transformToByteArray;
    if (typeof transform === "function") {
      return Uint8Array.from(await transform.call(body));
    }
  }

  if (body && typeof body === "object" && Symbol.asyncIterator in body) {
    const chunks: Uint8Array[] = [];
    let length = 0;

    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : Uint8Array.from(chunk);
      length += bytes.byteLength;
      if (length > MAX_IMAGE_BYTES) {
        throw new Error("Badge image exceeds the 5 MB limit.");
      }
      chunks.push(bytes);
    }

    return Uint8Array.from(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), length));
  }

  throw new Error("Badge image object has no readable body.");
}

function imageFormat(bytes: Uint8Array) {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png" as const;
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg" as const;
  }

  throw new Error("Badge images must be valid PNG or JPEG files.");
}

function assertImageDimensions(width: number, height: number) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error("Badge image dimensions exceed the supported limit.");
  }
}

function decodeRaster(bytes: Uint8Array, format: RasterImage["format"]) {
  if (format === "png") {
    const width = Buffer.from(bytes).readUInt32BE(16);
    const height = Buffer.from(bytes).readUInt32BE(20);
    assertImageDimensions(width, height);
    const decoded = PNG.sync.read(Buffer.from(bytes));
    assertImageDimensions(decoded.width, decoded.height);
    return {
      width: decoded.width,
      height: decoded.height,
      rgba: Uint8Array.from(decoded.data)
    };
  }

  const decoded = jpeg.decode(bytes, {
    formatAsRGBA: true,
    maxMemoryUsageInMB: 64,
    useTArray: true
  });
  assertImageDimensions(decoded.width, decoded.height);
  return {
    width: decoded.width,
    height: decoded.height,
    rgba: Uint8Array.from(decoded.data)
  };
}

async function loadBadgeImage(element: BadgeElement, orgId: string): Promise<RasterImage> {
  const key = requireTenantAssetKey(element, orgId);
  let object: GetObjectCommandOutput;

  try {
    object = await s3Client.send(
      new GetObjectCommand({
        Bucket: workerEnv.S3_BUCKET_NAME,
        Key: key
      })
    );
  } catch (error) {
    throw new Error(`Badge image asset ${key} could not be loaded.`, { cause: error });
  }

  if (typeof object.ContentLength === "number" && object.ContentLength > MAX_IMAGE_BYTES) {
    throw new Error(`Badge image asset ${key} exceeds the 5 MB limit.`);
  }

  const bytes = await readObjectBody(object.Body);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(`Badge image asset ${key} must be between 1 byte and 5 MB.`);
  }

  const format = imageFormat(bytes);
  const declaredType = object.ContentType?.split(";", 1)[0]?.trim().toLowerCase();
  const expectedType = format === "png" ? "image/png" : "image/jpeg";
  if (declaredType && declaredType !== expectedType) {
    throw new Error(`Badge image asset ${key} has a content type that does not match its bytes.`);
  }

  try {
    return {
      key,
      format,
      bytes,
      ...decodeRaster(bytes, format)
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Badge image")) {
      throw error;
    }
    throw new Error(`Badge image asset ${key} is corrupt or unsupported.`, { cause: error });
  }
}

async function loadBadgeImages(layout: BadgeLayout, orgId: string) {
  const assets = new Map<BadgeElement, RasterImage>();
  const cache = new Map<string, Promise<RasterImage>>();

  for (const element of layout.elements) {
    if (element.type !== "image") continue;
    const key = requireTenantAssetKey(element, orgId);
    const pending = cache.get(key) ?? loadBadgeImage(element, orgId);
    cache.set(key, pending);
    assets.set(element, await pending);
  }

  return assets;
}

function publicUrl(key: string) {
  const bucket = workerEnv.S3_BUCKET_NAME;

  if (workerEnv.S3_PUBLIC_URL) {
    return `${workerEnv.S3_PUBLIC_URL.replace(/\/$/, "")}/${key}`;
  }

  if (workerEnv.S3_ENDPOINT) {
    return `${workerEnv.S3_ENDPOINT.replace(/\/$/, "")}/${bucket}/${key}`;
  }

  return `https://${bucket}.s3.${workerEnv.AWS_REGION}.amazonaws.com/${key}`;
}

async function uploadPdf(orgId: string, eventId: string, pdfBytes: Uint8Array) {
  const bucket = workerEnv.S3_BUCKET_NAME;

  const key = `${orgId}/badges/${eventId}-${Date.now()}.pdf`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(pdfBytes),
      ContentType: "application/pdf"
    })
  );

  return publicUrl(key);
}

async function loadBadges(data: GenerateBadgesJob) {
  return prisma.badge.findMany({
    where: {
      orgId: data.orgId,
      templateId: data.templateId,
      template: {
        orgId: data.orgId,
        eventId: data.eventId
      },
      id: data.badgeIds
        ? {
            in: data.badgeIds
          }
        : undefined,
      registration: {
        orgId: data.orgId,
        eventId: data.eventId,
        event: {
          orgId: data.orgId
        }
      }
    },
    include: {
      registration: {
        include: {
          event: true,
          type: true,
          attendeeProfile: { select: { fullName: true, badgeName: true, email: true } },
          portalAccount: { select: { email: true, name: true } }
        }
      },
      template: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });
}

export async function processGenerateBadges(job: Job<GenerateBadgesJob>) {
  const badges = await loadBadges(job.data);

  if (badges.length === 0) {
    return {
      generated: 0,
      pdfUrl: null
    };
  }

  const layout = parseLayout(badges[0]!.template.layout);
  const fonts = await loadBadgeFonts();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fonts.pdfBytes, { subset: true });
  const imageAssets = await loadBadgeImages(layout, job.data.orgId);
  const embeddedImages = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
  const zplOutput: Array<{ badgeId: string; zpl: string }> = [];

  for (const image of imageAssets.values()) {
    if (!embeddedImages.has(image.key)) {
      embeddedImages.set(image.key, image.format === "png" ? await pdf.embedPng(image.bytes) : await pdf.embedJpg(image.bytes));
    }
  }

  for (const badge of badges) {
    const content = resolveBadgeContent(layout, badge, fonts, imageAssets);
    const codeImages = new Map<BadgeElement, Awaited<ReturnType<typeof pdf.embedPng>>>();
    for (const resolved of content.elements) {
      if (resolved.kind !== "code") continue;
      try {
        codeImages.set(resolved.element, await pdf.embedPng(await barcodePng(resolved.data, resolved.element.type as "barcode" | "qr")));
      } catch (error) {
        throw asBadgeRenderError(resolved.element, error);
      }
    }
    const page = pdf.addPage([layout.width, layout.height]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: layout.width,
      height: layout.height,
      color: rgb(1, 1, 1)
    });

    for (const resolved of content.elements) {
      const { element } = resolved;
      const y = layout.height - element.y - element.h;
      try {
      if (resolved.kind === "code") {
        page.drawImage(codeImages.get(element)!, {
          x: element.x,
          y,
          width: element.w,
          height: element.h
        });
      } else if (resolved.kind === "image") {
        page.drawImage(embeddedImages.get(resolved.image.key)!, {
          x: element.x,
          y,
          width: element.w,
          height: element.h
        });
      } else {
        const fitted = fitBadgeText(resolved.text, element.w, Math.min(22, Math.max(10, element.h * 0.55)), measureWith(fonts.pdf));
        if (!fitted.text) continue;
        page.drawText(fitted.text, {
          x: element.x,
          y: y + Math.max(2, element.h / 4),
          size: fitted.size,
          font,
          color: rgb(0.07, 0.09, 0.12)
        });
      }
      } catch (error) {
        throw asBadgeRenderError(element, error);
      }
    }

    zplOutput.push({
      badgeId: badge.id,
      zpl: toZpl(layout, content, fonts.zpl)
    });
  }

  const pdfUrl = await uploadPdf(job.data.orgId, job.data.eventId, await pdf.save());
  const generatedAt = new Date();

  await prisma.$transaction(
    zplOutput.map((output) =>
      prisma.badge.update({
        where: {
          id: output.badgeId
        },
        data: {
          generatedAt,
          pdfUrl,
          zplData: output.zpl
        }
      })
    )
  );

  return {
    generated: badges.length,
    pdfUrl,
    zplOutput
  };
}
