import { requirePlatformAdminPage } from "@/lib/dashboard-access";
import { redirect } from "next/navigation";

export async function GET() {
  await requirePlatformAdminPage();
  redirect("/platform/payments/payouts/export");
}
