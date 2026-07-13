"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string };

function tabsFor(pathname: string, eventId: string): Tab[] {
  const root = `/dashboard/events/${eventId}`;

  if (pathname.startsWith(`${root}/registrations`)) {
    return [
      { href: `${root}/registrations`, label: "All registrations" },
      { href: `${root}/registrations/types`, label: "Registration types" },
      { href: `${root}/registrations/transfers`, label: "Transfers" }
    ];
  }

  if (pathname.startsWith(`${root}/check-in`)) {
    return [
      { href: `${root}/check-in`, label: "Staff check-in" },
      { href: `${root}/check-in/cashier`, label: "Cashier" },
      { href: `${root}/check-in/express`, label: "Express kiosk" }
    ];
  }

  if (pathname.startsWith(`${root}/badges`)) {
    return [
      { href: `${root}/badges`, label: "Print queue" },
      { href: `${root}/badges/designer`, label: "Designer" }
    ];
  }

  if (pathname.startsWith(`${root}/staff`)) {
    return [
      { href: `${root}/staff`, label: "Overview" },
      { href: `${root}/staff/applications`, label: "Applications" },
      { href: `${root}/staff/departments`, label: "Departments" },
      { href: `${root}/staff/schedule`, label: "Schedule" }
    ];
  }

  if (pathname.startsWith(`${root}/vendors`)) {
    return [
      { href: `${root}/vendors`, label: "Applications" },
      { href: `${root}/vendors/booths`, label: "Booths" }
    ];
  }

  if (pathname.startsWith(`${root}/store`) || pathname.startsWith(`${root}/vouchers`)) {
    return [
      { href: `${root}/store`, label: "Products" },
      { href: `${root}/store/orders`, label: "Orders" },
      { href: `${root}/vouchers`, label: "Vouchers" }
    ];
  }

  if (pathname.startsWith(`${root}/settings`)) {
    return [
      { href: `${root}/settings`, label: "General" },
      { href: `${root}/settings/emails`, label: "Email templates" },
      { href: `${root}/settings/branding`, label: "Branding" }
    ];
  }

  return [];
}

export function EventSectionTabs({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const tabs = tabsFor(pathname, eventId);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="vf-event-tabs">
      <nav aria-label="Event section navigation">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
