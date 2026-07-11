"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/organizations", label: "Organizations" },
  { href: "/dashboard/events", label: "Events" },
  { href: "/dashboard/settings", label: "Settings" }
];

function isActiveNavItem(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardAppShell({ children, userName }: Readonly<{ children: ReactNode; userName?: string | null }>) {
  const pathname = usePathname();

  return (
    <div className="vf-dashboard-shell">
      <aside className="vf-dashboard-sidebar">
        <div className="vf-dashboard-brand">
          <Link href="/dashboard">vFurst</Link>
          <span>{userName ?? "Organizer"}</span>
        </div>
        <nav aria-label="Dashboard navigation">
          <p className="vf-label">Main</p>
          {navItems.map((item) => {
            const active = isActiveNavItem(pathname, item.href);

            return (
              <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} data-active={active || undefined}>
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Button label="Logout" href="/api/auth/signout" size="sm" variant="ghost" />
      </aside>
      <main className="vf-dashboard-main">{children}</main>
    </div>
  );
}
