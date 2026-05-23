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
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        timezone: true,
        startsAt: true,
        endsAt: true,
        venueName: true,
        contactEmail: true,
        description: true,
        organization: {
          select: {
            name: true,
            slug: true
          }
        }
      }
    });

    if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") {
      notFound("Event not found");
    }

    return NextResponse.json({ event });
  } catch (error) {
    return handleRouteError(error);
  }
}
