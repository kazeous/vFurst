import { requirePlatformAdminPage } from "@/lib/dashboard-access";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  await requirePlatformAdminPage();
  redirect("/platform/organizations");
}
