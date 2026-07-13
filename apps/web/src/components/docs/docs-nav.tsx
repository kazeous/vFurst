"use client";

import { BookOpen, Braces, ListChecks, Webhook } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/docs", label: "Documentation home", icon: BookOpen },
  { href: "/docs/onboarding", label: "Organizer onboarding", icon: ListChecks },
  { href: "/docs/api", label: "REST API", icon: Braces },
  { href: "/docs/webhooks", label: "Webhooks", icon: Webhook }
];

export function DocsNav() {
  const pathname = usePathname();
  return <nav className="vf-docs-nav" aria-label="Documentation navigation">{items.map(({ href, label, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined}><Icon size={17} />{label}</Link>)}</nav>;
}
