import { processSePayTransaction } from "@/lib/payments/sepay-processing";
import { verifySePaySignature } from "@/lib/payments/sepay";
import { prisma, type Prisma } from "@vfurst/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const payloadSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  accountNumber: z.string().min(1),
  code: z.string().nullable().optional().transform((value) => value || null),
  content: z.string().nullable().optional(),
  transferType: z.enum(["in", "out"]),
  transferAmount: z.coerce.number().int().positive()
}).passthrough();

function success() {
  return NextResponse.json({ success: true }, { status: 200 });
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  if (!verifySePaySignature(rawBody, request.headers.get("x-sepay-timestamp"), request.headers.get("x-sepay-signature"))) {
    return NextResponse.json({ success: false, message: "Invalid signature." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON." }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload." }, { status: 400 });
  }

  const existing = await prisma.sePayWebhookEvent.findUnique({
    where: {
      sepayTransactionId: parsed.data.id
    }
  });

  if (existing?.processedAt) {
    return success();
  }

  await prisma.sePayWebhookEvent.upsert({
    where: {
      sepayTransactionId: parsed.data.id
    },
    update: {
      payload: parsed.data as Prisma.InputJsonValue
    },
    create: {
      sepayTransactionId: parsed.data.id,
      payload: parsed.data as Prisma.InputJsonValue
    }
  });

  try {
    await processSePayTransaction({
      id: parsed.data.id,
      accountNumber: parsed.data.accountNumber,
      code: parsed.data.code,
      transferType: parsed.data.transferType,
      transferAmount: parsed.data.transferAmount,
      payload: parsed.data as Prisma.InputJsonValue
    });
    await prisma.sePayWebhookEvent.update({
      where: {
        sepayTransactionId: parsed.data.id
      },
      data: {
        processedAt: new Date()
      }
    });
    return success();
  } catch (error) {
    console.error("SePay webhook processing failed.", error);
    return NextResponse.json({ success: false, message: "Processing failed." }, { status: 500 });
  }
}
