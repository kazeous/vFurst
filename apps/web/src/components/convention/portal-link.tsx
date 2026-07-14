"use client";

import { getPortalHref } from "@/lib/portal-path";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function PortalLink({
  children,
  className,
  subdomain,
  suffix = ""
}: {
  children: ReactNode;
  className?: string;
  subdomain: string;
  suffix?: string;
}) {
  const pathname = usePathname();
  const href = getPortalHref(pathname, subdomain, suffix);

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}
