import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { GetObjectCommandOutput } from "@aws-sdk/client-s3";
import { prisma } from "@vfurst/db";
import bwipjs from "bwip-js/node";
import type { Job } from "bullmq";
import jpeg from "jpeg-js";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { PNG } from "pngjs";
import { workerEnv } from "../env.js";
import type { GenerateBadgesJob } from "../queues.js";

type BadgeElement = {
  id?: string;
  type: "text" | "image" | "barcode" | "qr";
  x: number;
  y: number;
  w: number;
  h: number;
  field?: string;
  value?: string;
  assetKey?: string;
};

type BadgeLayout = {
  width: number;
  height: number;
  elements: BadgeElement[];
};

type RasterImage = {
  key: string;
  format: "png" | "jpeg";
  bytes: Uint8Array;
  width: number;
  height: number;
  rgba: Uint8Array;
};

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
      return badge.registration.user.name ?? badge.registration.user.email;
    case "attendee.email":
      return badge.registration.user.email;
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

function toZplGraphic(element: BadgeElement, image: RasterImage) {
  const width = Math.max(1, Math.round(element.w));
  const height = Math.max(1, Math.round(element.h));
  const bytesPerRow = Math.ceil(width / 8);
  const bitmap = Buffer.alloc(bytesPerRow * height);

  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / width));
      const offset = (sourceY * image.width + sourceX) * 4;
      const alpha = image.rgba[offset + 3]! / 255;
      const red = image.rgba[offset]! * alpha + 255 * (1 - alpha);
      const green = image.rgba[offset + 1]! * alpha + 255 * (1 - alpha);
      const blue = image.rgba[offset + 2]! * alpha + 255 * (1 - alpha);
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

      if (luminance < 180) {
        bitmap[y * bytesPerRow + Math.floor(x / 8)]! |= 0x80 >> (x % 8);
      }
    }
  }

  return `^GFA,${bitmap.length},${bitmap.length},${bytesPerRow},${bitmap.toString("hex").toUpperCase()}^FS`;
}

function toZpl(
  layout: BadgeLayout,
  badge: Awaited<ReturnType<typeof loadBadges>>[number],
  imageAssets: Map<BadgeElement, RasterImage>
) {
  const commands = ["^XA"];

  for (const element of layout.elements) {
    const value = renderValue(element, badge);
    commands.push(`^FO${Math.round(element.x)},${Math.round(element.y)}`);

    if (element.type === "qr") {
      commands.push(`^BQN,2,5^FDLA,${value}^FS`);
    } else if (element.type === "barcode") {
      commands.push(`^BCN,${Math.round(element.h)},Y,N,N^FD${value}^FS`);
    } else if (element.type === "image") {
      const image = imageAssets.get(element);
      if (!image) throw new Error(`Badge image layer ${element.id ?? "(unnamed)"} was not loaded.`);
      commands.push(toZplGraphic(element, image));
    } else {
      commands.push(`^A0N,${Math.max(18, Math.round(element.h * 0.7))},${Math.max(16, Math.round(element.h * 0.5))}`);
      commands.push(`^FB${Math.round(element.w)},2,0,L^FD${value}^FS`);
    }
  }

  commands.push("^XZ");
  return commands.join("\n");
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
          user: true
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
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const imageAssets = await loadBadgeImages(layout, job.data.orgId);
  const embeddedImages = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
  const zplOutput: Array<{ badgeId: string; zpl: string }> = [];

  for (const badge of badges) {
    const page = pdf.addPage([layout.width, layout.height]);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: layout.width,
      height: layout.height,
      color: rgb(1, 1, 1)
    });

    for (const element of layout.elements) {
      const y = layout.height - element.y - element.h;
      const value = renderValue(element, badge);

      if (element.type === "barcode" || element.type === "qr") {
        const png = await pdf.embedPng(await barcodePng(value || badge.barcodeData, element.type));
        page.drawImage(png, {
          x: element.x,
          y,
          width: element.w,
          height: element.h
        });
      } else if (element.type === "image") {
        const image = imageAssets.get(element);
        if (!image) throw new Error(`Badge image layer ${element.id ?? "(unnamed)"} was not loaded.`);
        let embedded = embeddedImages.get(image.key);
        if (!embedded) {
          embedded = image.format === "png" ? await pdf.embedPng(image.bytes) : await pdf.embedJpg(image.bytes);
          embeddedImages.set(image.key, embedded);
        }
        page.drawImage(embedded, {
          x: element.x,
          y,
          width: element.w,
          height: element.h
        });
      } else {
        page.drawText(value, {
          x: element.x,
          y: y + Math.max(2, element.h / 4),
          size: Math.min(22, Math.max(10, element.h * 0.55)),
          font,
          color: rgb(0.07, 0.09, 0.12),
          maxWidth: element.w
        });
      }
    }

    zplOutput.push({
      badgeId: badge.id,
      zpl: toZpl(layout, badge, imageAssets)
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
