import { requirePlatformAdminPage } from "@/lib/dashboard-access";
import { redirect } from "next/navigation";

export default async function NewOrganizationPage() {
  await requirePlatformAdminPage();
  redirect("/platform/organizations/new");
}
