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

  const [membershipCount, memberships] = await Promise.all([
    prisma.orgMember.count({ where: { userId: session.user.id } }),
    prisma.orgMember.findMany({
      where: {
        userId: session.user.id,
        role: {
          in: ["OWNER", "ADMIN"]
        }
      },
      orderBy: { org: { name: "asc" } },
      select: {
        org: {
          select: {
            id: true,
            name: true,
            logo: true,
            status: true,
            events: {
              orderBy: { startDate: "desc" },
              select: { id: true, name: true, status: true, startDate: true }
            }
          }
        }
      }
    })
  ]);

  if (membershipCount === 0) {
    if (session.user.platformRole === "PLATFORM_ADMIN") {
      redirect("/platform");
    }
    notFound();
  }

  const organizations = memberships.map(({ org }) => ({ id: org.id, name: org.name, logo: org.logo, status: org.status }));
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
