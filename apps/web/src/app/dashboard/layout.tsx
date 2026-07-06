import { DashboardAppShell } from "@/components/dashboard/app-shell";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function DashboardLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return <DashboardAppShell userName={session.user.name}>{children}</DashboardAppShell>;
}

