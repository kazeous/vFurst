import { requireOrgPageAccess } from "@/lib/dashboard-access";
import type { ReactNode } from "react";

export default async function OrganizationLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  await requireOrgPageAccess(orgId);

  return children;
}
