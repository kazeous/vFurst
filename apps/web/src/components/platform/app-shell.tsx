import { staffSignOut } from "@/actions/staff-auth-actions";
import { Badge } from "@/components/ui/badge";
import { Building2, CreditCard, Gauge, Globe2, LayoutDashboard, LogOut, MailWarning, UserCog } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function PlatformAppShell({
  children,
  userName,
  userEmail,
  accountManagementUrl
}: Readonly<{
  children: ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  accountManagementUrl: string;
}>) {
  return (
    <div className="vf-app-shell" data-app-shell-ready="true">
      <aside className="vf-app-sidebar" aria-label="Platform control plane">
        <div className="vf-app-sidebar-header">
          <Link className="vf-app-logo" href="/platform">
            <span className="vf-app-logo-mark">vF</span>
            <span className="vf-app-logo-word">vFurst</span>
          </Link>
        </div>

        <div className="vf-workspace-switcher">
          <div className="vf-workspace-name">
            <span className="vf-workspace-avatar">CP</span>
            <div className="vf-workspace-copy">
              <strong>Platform</strong>
              <small>Control plane</small>
            </div>
          </div>
          <Badge label="Platform admin only" variant="info" />
        </div>

        <nav className="vf-app-navigation" aria-label="Platform navigation">
          <div className="vf-nav-group">
            <p className="vf-nav-group-label">Platform</p>
            <Link className="vf-nav-link" href="/platform"><Gauge size={18} aria-hidden="true" /><span>Overview</span></Link>
            <Link className="vf-nav-link" href="/platform/organizations"><Building2 size={18} aria-hidden="true" /><span>Organizations</span></Link>
            <Link className="vf-nav-link" href="/platform/domains"><Globe2 size={18} aria-hidden="true" /><span>Domains</span></Link>
            <Link className="vf-nav-link" href="/platform/payments"><CreditCard size={18} aria-hidden="true" /><span>Payments</span></Link>
            <Link className="vf-nav-link" href="/platform/operations/email"><MailWarning size={18} aria-hidden="true" /><span>Email operations</span></Link>
          </div>
          <div className="vf-nav-group">
            <p className="vf-nav-group-label">Workspace</p>
            <Link className="vf-nav-link" href="/dashboard"><LayoutDashboard size={18} aria-hidden="true" /><span>Organizer dashboard</span></Link>
          </div>
        </nav>

        <div className="vf-app-sidebar-footer vf-app-sidebar-footer-stacked">
          <div className="vf-app-user-trigger">
            <span className="vf-user-avatar">{(userName ?? userEmail ?? "PA").slice(0, 2).toUpperCase()}</span>
            <span className="vf-app-user-copy"><strong>{userName ?? "Platform admin"}</strong><span>{userEmail}</span></span>
          </div>
          <a className="vf-nav-link" href={accountManagementUrl}><UserCog size={18} aria-hidden="true" /><span>Manage your Reyuu Games account</span></a>
          <Link className="vf-nav-link" href="/staff/sessions"><UserCog size={18} aria-hidden="true" /><span>Your vFurst sessions</span></Link>
          <form action={staffSignOut}>
            <button className="vf-nav-link" type="submit"><LogOut size={18} aria-hidden="true" /><span>Log out</span></button>
          </form>
        </div>
      </aside>

      <div className="vf-app-content">
        <header className="vf-app-topbar">
          <div className="vf-app-topbar-actions"><strong>Platform control plane</strong></div>
        </header>
        <main className="vf-dashboard-main" id="main-content">{children}</main>
      </div>
    </div>
  );
}
