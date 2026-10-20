import { Button } from "@/components/ui/button";
import { requirePortalPageContext } from "@/lib/portal-context";
import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutForm } from "../login/sign-out-form";

const navigation = [
  { href: "/account", label: "Overview" },
  { href: "/account/attendees", label: "Attendees" },
  { href: "/account/registrations", label: "Registrations" },
  { href: "/account/transfers", label: "Transfers" },
  { href: "/account/raffles", label: "Raffles" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/hotel", label: "Hotel" },
  { href: "/account/applications", label: "Applications" },
  { href: "/account/profile", label: "Profile" }
];

export default async function AccountLayout({ children, params }: { children: ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { account, org } = await requirePortalPageContext(orgSlug, "/account");

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Your account</p>
          <h1>{account.name ?? account.email}</h1>
          <p className="vf-muted">Your registrations, purchases, stays, and applications for {org.name}.</p>
        </div>
        <div className="vf-actions">
          <Button label="Event portal" href="/" />
          <SignOutForm email={account.email} />
        </div>
      </header>
      <nav className="vf-actions" aria-label="Account navigation">
        {navigation.map((item) => (
          <Link key={item.href} href={item.href} className="vf-ui-button vf-ui-button-ghost vf-ui-button-sm">
            {item.label}
          </Link>
        ))}
      </nav>
      <main>{children}</main>
    </div>
  );
}
