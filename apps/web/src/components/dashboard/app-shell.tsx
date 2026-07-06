"use client";

import { AppShell } from "@astryxdesign/core/AppShell";
import { Button } from "@astryxdesign/core/Button";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import type { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/organizations", label: "Organizations" },
  { href: "/dashboard/events", label: "Events" },
  { href: "/dashboard#settings", label: "Settings" }
];

export function DashboardAppShell({ children, userName }: Readonly<{ children: ReactNode; userName?: string | null }>) {
  return (
    <AppShell
      variant="section"
      contentPadding={0}
      sideNav={
        <SideNav
          header={<SideNavHeading heading="vFurst" headingHref="/dashboard" subheading={userName ?? "Organizer"} />}
          footer={<Button label="Logout" href="/api/auth/signout" size="sm" variant="ghost" />}
          collapsible
        >
          <SideNavSection title="Main">
            {navItems.map((item) => (
              <SideNavItem key={item.href} href={item.href} label={item.label} />
            ))}
          </SideNavSection>
        </SideNav>
      }
      mobileNav={{ breakpoint: "md" }}
    >
      {children}
    </AppShell>
  );
}
