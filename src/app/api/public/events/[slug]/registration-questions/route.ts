import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { handleRouteError, notFound } from "@/server/http";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const event = await db.event.findUnique({
      where: { slug },
      select: { id: true, status: true }
    });

    if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") {
      notFound("Event not found");
    }

    const questions = await db.registrationQuestion.findMany({
      where: { eventId: event.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });

    return NextResponse.json({ questions });
  } catch (error) {
    return handleRouteError(error);
  }
}
