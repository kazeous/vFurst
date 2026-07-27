"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getPortalHref } from "@/lib/portal-path";

const items = [
  { suffix: "", label: "Overview" },
  { suffix: "/register", label: "Tickets" },
  { suffix: "/hotel", label: "Hotel" },
  { suffix: "/store", label: "Shop" },
  { suffix: "/volunteer", label: "Volunteer" },
  { suffix: "/vendor-apply", label: "Vendors" }
];

export function PortalNav({ slug }: { slug: string }) {
  const pathname = usePathname();

  return (
    <nav className="vf-portal-nav" aria-label="Convention portal navigation">
      {items.map((item) => {
        const href = getPortalHref(pathname, slug, item.suffix);
        const portalRoot = getPortalHref(pathname, slug);
        const active = item.suffix ? pathname.startsWith(href) : pathname === portalRoot || pathname === `${portalRoot}/`;
        return <Link key={item.label} href={href} aria-current={active ? "page" : undefined}>{item.label}</Link>;
      })}
    </nav>
  );
}
