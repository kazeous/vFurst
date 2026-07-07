import { jsonError, requireApiKey, withRateHeaders } from "@/lib/api/auth";
import { prisma } from "@vfurst/db";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const context = await requireApiKey(request, "read:events");

  if (context instanceof Response) {
    return context;
  }

  const { eventId } = await params;
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      orgId: context.apiKey.orgId
    },
    include: {
      registrationTypes: true
    }
  });

  if (!event) {
    return jsonError("Event not found.", 404, "not_found");
  }

  return withRateHeaders(Response.json(event), context);
}
