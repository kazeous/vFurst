import { DashboardAppShell } from "@/components/dashboard/app-shell";
import { auth } from "@/lib/auth";
import { prisma } from "@vfurst/db";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const allMemberships = await prisma.orgMember.findMany({
    where: { userId: session.user.id },
    orderBy: { org: { name: "asc" } },
    select: {
      role: true,
      org: {
        select: {
          id: true,
          name: true,
          logo: true,
          status: true,
          events: {
            orderBy: { startDate: "desc" },
            select: {
              id: true,
              name: true,
              status: true,
              startDate: true
            }
          }
        }
      }
    }
  });

  const memberships = allMemberships.filter((membership) => ["OWNER", "ADMIN"].includes(membership.role));

  if (allMemberships.length === 0) {
    if (session.user.platformRole === "PLATFORM_ADMIN") {
      redirect("/platform");
    }
    notFound();
  }

  const organizations = memberships.map((membership) => ({
    id: membership.org.id,
    name: membership.org.name,
    logo: membership.org.logo,
    status: membership.org.status
  }));
  const events = memberships.flatMap((membership) =>
    membership.org.events.map((event) => ({
      id: event.id,
      orgId: membership.org.id,
      name: event.name,
      orgName: membership.org.name,
      status: event.status,
      startDate: event.startDate.toISOString()
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
