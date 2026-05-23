import { NextResponse } from "next/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { handleRouteError, notFound, parseJsonBody } from "@/server/http";
import { assertRateLimit } from "@/server/rate-limit";
import { assertVolunteerApplicationsOpen } from "@/server/volunteers";
import { createVolunteerApplicationInputSchema } from "@/shared/schemas/volunteer";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    assertRateLimit(`volunteer-application:${slug}:${getClientIp(request)}`, 3, 60_000);

    const input = await parseJsonBody(request, createVolunteerApplicationInputSchema);
    const session = await auth();

    const event = await db.event.findUnique({
      where: { slug },
      select: { id: true, status: true }
    });

    if (!event || event.status === "DRAFT" || event.status === "ARCHIVED") {
      notFound("Event not found");
    }

    assertVolunteerApplicationsOpen(event);

    const application = await db.volunteerApplication.create({
      data: {
        eventId: event.id,
        userId: session?.user?.id ?? null,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        preferredContactMethod: input.preferredContactMethod,
        availability: input.availability,
        departmentInterests: input.departmentInterests,
        priorExperience: input.priorExperience
      }
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
