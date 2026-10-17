import { PlatformAppShell } from "@/components/platform/app-shell";
import { requirePlatformAdminPage } from "@/lib/dashboard-access";
import { getStaffAccountManagementUrl } from "@/lib/staff-oidc";
import type { ReactNode } from "react";

export default async function PlatformLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await requirePlatformAdminPage();

  return (
    <PlatformAppShell userName={user.name} userEmail={user.email} accountManagementUrl={getStaffAccountManagementUrl()}>
      {children}
    </PlatformAppShell>
  );
}
