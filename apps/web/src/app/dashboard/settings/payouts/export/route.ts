import { requirePlatformAdmin } from "@/lib/dashboard-access";
import { prisma } from "@vfurst/db";

function csvCell(value: unknown) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export async function GET() {
  await requirePlatformAdmin();
  const entries = await prisma.organizerLedgerEntry.findMany({
    where: { status: "OPEN" },
    include: { org: true },
    orderBy: [{ orgId: "asc" }, { createdAt: "asc" }]
  });
  const rows = [
    ["entry_id", "organization", "currency", "amount", "order_id", "bank", "account_number", "account_holder"],
    ...entries.map((entry) => [
      entry.id,
      entry.org.name,
      entry.currency,
      entry.amount,
      entry.orderId ?? "",
      entry.org.payoutBankCode ?? "",
      entry.org.payoutAccountNumber ?? "",
      entry.org.payoutAccountHolder ?? ""
    ])
  ];

  return new Response(rows.map((row) => row.map(csvCell).join(",")).join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="vfurst-sepay-payables.csv"'
    }
  });
}
