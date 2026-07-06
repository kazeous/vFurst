"use client";

import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import Link from "next/link";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/organizations", label: "Organizations" },
  { href: "/dashboard#events", label: "Events" },
  { href: "/dashboard#settings", label: "Settings" }
];

export function DashboardAppShell({ children, userName }: Readonly<{ children: ReactNode; userName?: string | null }>) {
  return (
    <AppShell
      variant="section"
      contentPadding={0}
      sideNav={
        <aside className="vf-side-nav" aria-label="Dashboard navigation">
          <Link className="vf-brand" href="/dashboard">
            vFurst
          </Link>
          <nav>
            {navItems.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="vf-profile">
            <span>{userName ?? "Organizer"}</span>
            <Button label="Logout" href="/api/auth/signout" size="sm" variant="ghost" />
          </div>
        </aside>
      }
      mobileNav={{ breakpoint: "md" }}
    >
      {children}
    </AppShell>
  );
}

