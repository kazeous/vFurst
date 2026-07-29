import { DashboardAccessDenied } from "@/components/dashboard/access-denied";
import { auth } from "@/lib/auth";

export default async function ForbiddenPage() {
  const session = await auth();

  return <DashboardAccessDenied email={session?.user?.email} />;
}
