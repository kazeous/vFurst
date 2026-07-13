import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { prisma } from "@vfurst/db";
import bwipjs from "bwip-js/node";
import type { Job } from "bullmq";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
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
};

type BadgeLayout = {
  width: number;
  height: number;
  elements: BadgeElement[];
};

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

function toZpl(layout: BadgeLayout, badge: Awaited<ReturnType<typeof loadBadges>>[number]) {
  const commands = ["^XA"];

  for (const element of layout.elements) {
    const value = renderValue(element, badge);
    commands.push(`^FO${Math.round(element.x)},${Math.round(element.y)}`);

    if (element.type === "qr") {
      commands.push(`^BQN,2,5^FDLA,${value}^FS`);
    } else if (element.type === "barcode") {
      commands.push(`^BCN,${Math.round(element.h)},Y,N,N^FD${value}^FS`);
    } else if (element.type === "image") {
      commands.push(`^GB${Math.round(element.w)},${Math.round(element.h)},2^FS`);
      commands.push(`^FO${Math.round(element.x + 8)},${Math.round(element.y + 8)}^A0N,20,20^FDIMAGE^FS`);
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
        page.drawRectangle({
          x: element.x,
          y,
          width: element.w,
          height: element.h,
          borderColor: rgb(0.55, 0.6, 0.65),
          borderWidth: 1
        });
        page.drawText("IMAGE", {
          x: element.x + 8,
          y: y + element.h / 2 - 6,
          size: 10,
          font,
          color: rgb(0.2, 0.25, 0.3)
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
      zpl: toZpl(layout, badge)
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
