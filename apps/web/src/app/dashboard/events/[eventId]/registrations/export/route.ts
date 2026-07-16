import { csvDownload } from "@/lib/csv";
import { requireEventPageAccess } from "@/lib/dashboard-access";
import { prisma } from "@vfurst/db";

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event } = await requireEventPageAccess(eventId);
  const registrations = await prisma.registration.findMany({
    where: {
      eventId: event.id,
      orgId: event.orgId,
      type: {
        eventId: event.id,
        orgId: event.orgId
      }
    },
    include: {
      type: true,
      user: true
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  const rows = [
    ["Name", "Email", "Type", "Status", "Approval", "Badge Number", "Created"],
    ...registrations.map((registration) => [
      registration.user.name ?? "",
      registration.user.email,
      registration.type.name,
      registration.status,
      registration.approvalStatus,
      registration.badgeNumber ?? "",
      registration.createdAt.toISOString()
    ])
  ];

  return csvDownload(rows, `registrations-${event.id}.csv`);
}
