import { DashboardAppShell } from "@/components/dashboard/app-shell";
import { auth } from "@/lib/auth";
import { prisma } from "@vfurst/db";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const memberships = await prisma.orgMember.findMany({
    where: { userId: session.user.id },
    orderBy: { org: { name: "asc" } },
    select: {
      org: {
        select: {
          id: true,
          name: true,
          logo: true,
          events: {
            orderBy: { startDate: "desc" },
            select: { id: true, name: true, status: true, startDate: true }
          }
        }
      }
    }
  });

  const organizations = memberships.map(({ org }) => ({ id: org.id, name: org.name, logo: org.logo }));
  const events = memberships.flatMap(({ org }) =>
    org.events.map((event) => ({
      id: event.id,
      orgId: org.id,
      name: event.name,
      orgName: org.name,
      status: event.status,
      startDate: event.startDate.toISOString()
    }))
  );

  return (
    <DashboardAppShell userName={session.user.name} userEmail={session.user.email} workspace={{ organizations, events }}>
      {children}
    </DashboardAppShell>
  );
}
