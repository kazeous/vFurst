import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth";
import { requirePublicAccount } from "@/lib/public-account";
import Link from "next/link";
import type { ReactNode } from "react";

const navigation = [
  { href: "/account", label: "Overview" },
  { href: "/account/registrations", label: "Registrations" },
  { href: "/account/transfers", label: "Transfers" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/hotel", label: "Hotel" },
  { href: "/account/applications", label: "Applications" },
  { href: "/account/profile", label: "Profile" }
];

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const user = await requirePublicAccount("/account");

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Public account</p>
          <h1>{user.name ?? user.email}</h1>
          <p className="vf-muted">Your registrations, purchases, stays, and applications across vFurst events.</p>
        </div>
        <div className="vf-actions">
          <Button label="Explore vFurst" href="/" />
          <form action={logout}>
            <Button label="Log out" type="submit" variant="ghost" />
          </form>
        </div>
      </header>
      <nav className="vf-actions" aria-label="Public account navigation">
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
