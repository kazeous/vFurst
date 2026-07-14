import { csvDownload } from "@/lib/csv";
import { requirePlatformAdminPage } from "@/lib/dashboard-access";
import { prisma } from "@vfurst/db";

export async function GET() {
  await requirePlatformAdminPage();
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

  return csvDownload(rows, "vfurst-sepay-payables.csv");
}
