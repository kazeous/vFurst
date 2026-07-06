import { prisma } from "@vfurst/db";

function csvCell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const registrations = await prisma.registration.findMany({
    where: {
      eventId
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
    ["Name", "Email", "Type", "Status", "Badge Number", "Created"],
    ...registrations.map((registration) => [
      registration.user.name ?? "",
      registration.user.email,
      registration.type.name,
      registration.status,
      registration.badgeNumber ?? "",
      registration.createdAt.toISOString()
    ])
  ];

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="registrations-${eventId}.csv"`
    }
  });
}

