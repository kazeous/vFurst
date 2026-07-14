import { DashboardAppShell } from "@/components/dashboard/app-shell";
import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const membershipCount = session.user.orgMemberships.length;
  const memberships = session.user.orgMemberships
    .filter((membership) => ["OWNER", "ADMIN"].includes(membership.role))
    .sort((left, right) => left.orgName.localeCompare(right.orgName));

  if (membershipCount === 0) {
    if (session.user.platformRole === "PLATFORM_ADMIN") {
      redirect("/platform");
    }
    notFound();
  }

  const organizations = memberships.map((membership) => ({
    id: membership.orgId,
    name: membership.orgName,
    logo: membership.orgLogo,
    status: membership.orgStatus
  }));
  const events = memberships.flatMap((membership) =>
    membership.events.map((event) => ({
      id: event.id,
      orgId: membership.orgId,
      name: event.name,
      orgName: membership.orgName,
      status: event.status,
      startDate: event.startDate
    }))
  );

  return (
    <DashboardAppShell
      userName={session.user.name}
      userEmail={session.user.email}
      isPlatformAdmin={session.user.platformRole === "PLATFORM_ADMIN"}
      workspace={{ organizations, events }}
    >
      {children}
    </DashboardAppShell>
  );
}
