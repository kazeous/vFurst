import { requireCheckoutOrder } from "@/lib/payments/checkout";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const { orderId } = await params;
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const order = await requireCheckoutOrder(orderId, token);
    const activeAttempt = order.paymentAttempts.find((attempt) => attempt.status === "PENDING");

    return NextResponse.json(
      {
        status: order.status === "PAID" ? "PAID" : activeAttempt?.expiresAt && activeAttempt.expiresAt <= new Date() ? "EXPIRED" : activeAttempt?.status ?? order.status,
        successPath: order.status === "PAID" ? order.checkoutSuccessPath : undefined
      },
      {
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  } catch {
    return NextResponse.json({ error: "Checkout not found." }, { status: 404 });
  }
}
