"use client";

import { getPortalHref } from "@/lib/portal-path";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function PortalLink({
  children,
  className,
  slug,
  suffix = ""
}: {
  children: ReactNode;
  className?: string;
  slug: string;
  suffix?: string;
}) {
  const pathname = usePathname();
  const href = getPortalHref(pathname, slug, suffix);

  return (
    <Link className={className} href={href}>
      {children}
    </Link>
  );
}
