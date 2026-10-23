import { csvDownload } from "@/lib/csv";
import { requireEventPageAccess } from "@/lib/dashboard-access";
import { getCurrentPolicyVersions } from "@/lib/policy-documents";
import { registrationExportCells, registrationExportHeader } from "@/lib/registration-details";
import { getRegistrationForm } from "@/lib/registration-form";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event } = await requireEventPageAccess(eventId);
  const storedEvent = await prisma.event.findFirst({
    where: { id: event.id, orgId: event.orgId },
    select: { registrationForm: true }
  });
  if (!storedEvent) notFound();
  const { questions } = getRegistrationForm(storedEvent.registrationForm);
  const current = await getCurrentPolicyVersions(prisma, { orgId: event.orgId, eventId: event.id });
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
      agreements: {
        where: { orgId: event.orgId, eventId: event.id },
        select: { documentId: true, acceptedAt: true, version: { select: { version: true } } }
      },
      attendeeProfile: { select: { id: true, fullName: true, badgeName: true } },
      portalAccount: { select: { id: true, email: true, name: true } }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  const rows = [
    ["Name", "Badge name", "Email", "Type", "Status", "Approval", "Badge Number", "Created", ...registrationExportHeader(questions, current)],
    ...registrations.map((registration) => [
      registration.attendeeProfile.fullName,
      registration.attendeeProfile.badgeName ?? "",
      registration.portalAccount.email,
      registration.type.name,
      registration.status,
      registration.approvalStatus,
      registration.badgeNumber ?? "",
      registration.createdAt.toISOString(),
      ...registrationExportCells(questions, current, registration)
    ])
  ];

  return csvDownload(rows, `registrations-${event.id}.csv`);
}
