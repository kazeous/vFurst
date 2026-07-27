"use client";

import {
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Hotel,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  TicketCheck,
  Users,
  X
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import type { OrganizationStatus } from "@vfurst/db";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DashboardCommandMenu, type CommandMenuItem } from "@/components/dashboard/command-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getDashboardEventId, getDashboardOrganizationId } from "@/lib/dashboard-navigation";

export type DashboardWorkspaceData = {
  organizations: Array<{ id: string; name: string; logo: string | null; status: OrganizationStatus }>;
  events: Array<{
    id: string;
    orgId: string;
    name: string;
    orgName: string;
    status: string;
    startDate: string;
  }>;
};

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  activePrefixes?: string[];
};

const baseWorkspaceNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/events", label: "Events", icon: CalendarDays },
  { href: "/dashboard/settings", label: "Settings", icon: Settings }
];

function eventGroups(eventId: string): Array<{ label: string; items: NavItem[] }> {
  const root = `/dashboard/events/${eventId}`;
  return [
    {
      label: "Event",
      items: [
        { href: root, label: "Overview", icon: LayoutDashboard },
        { href: `${root}/registrations`, label: "Registrations", icon: TicketCheck, activePrefixes: [`${root}/registrations`] }
      ]
    },
    {
      label: "On-site",
      items: [
        { href: `${root}/check-in`, label: "Check-in", icon: ShieldCheck, activePrefixes: [`${root}/check-in`] },
        { href: `${root}/badges`, label: "Badges", icon: BadgeCheck, activePrefixes: [`${root}/badges`] }
      ]
    },
    {
      label: "People",
      items: [
        { href: `${root}/staff`, label: "Staff", icon: Users, activePrefixes: [`${root}/staff`] },
        { href: `${root}/vendors`, label: "Vendors", icon: Building2, activePrefixes: [`${root}/vendors`] }
      ]
    },
    {
      label: "Commerce",
      items: [
        { href: `${root}/store`, label: "Store", icon: Store, activePrefixes: [`${root}/store`, `${root}/vouchers`] },
        { href: `${root}/hotel`, label: "Hotel", icon: Hotel, activePrefixes: [`${root}/hotel`] }
      ]
    },
    {
      label: "Insights",
      items: [
        { href: `${root}/analytics`, label: "Analytics", icon: BarChart3, activePrefixes: [`${root}/analytics`] },
        { href: `${root}/raffle`, label: "Raffle", icon: Sparkles, activePrefixes: [`${root}/raffle`] },
        { href: `${root}/settings`, label: "Event settings", icon: Settings, activePrefixes: [`${root}/settings`] }
      ]
    }
  ];
}

function initials(value?: string | null) {
  if (!value) return "VF";
  return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function isActive(pathname: string, item: NavItem) {
  if (item.href === "/dashboard") return pathname === item.href;
  if (item.activePrefixes) return item.activePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const Icon = item.icon;
  const link = (
    <Link className="vf-nav-link" href={item.href} aria-current={isActive(pathname, item) ? "page" : undefined} onClick={onNavigate}>
      <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function DashboardAppShell({
  children,
  userName,
  userEmail,
  isPlatformAdmin,
  workspace,
  logoutAction
}: Readonly<{
  children: ReactNode;
  userName?: string | null;
  userEmail?: string | null;
  isPlatformAdmin: boolean;
  workspace: DashboardWorkspaceData;
  logoutAction: () => Promise<void>;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const commandTriggerRef = useRef<HTMLButtonElement>(null);
  const eventId = getDashboardEventId(pathname);
  const orgIdFromPath = getDashboardOrganizationId(pathname);
  const currentEvent = workspace.events.find((event) => event.id === eventId);
  const currentOrgId = currentEvent?.orgId ?? orgIdFromPath;
  const currentOrg = workspace.organizations.find((org) => org.id === currentOrgId);
  const workspaceNav = useMemo(
    () => isPlatformAdmin ? [...baseWorkspaceNav, { href: "/platform", label: "Platform", icon: ShieldCheck }] : baseWorkspaceNav,
    [isPlatformAdmin]
  );

  useEffect(() => {
    const stored = window.localStorage.getItem("vfurst-sidebar-collapsed");
    setCollapsed(stored === "true");
    setIsReady(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => setMobileOpen(false), [pathname]);

  const groups = eventId ? eventGroups(eventId) : [{ label: "Workspace", items: workspaceNav }];
  const commandItems = useMemo<CommandMenuItem[]>(() => {
    const globalItems = workspaceNav.map((item) => ({ ...item, group: "Workspace" }));
    const destinationItems = eventId ? eventGroups(eventId).flatMap((group) => group.items.map((item) => ({ ...item, group: currentEvent?.name ?? group.label }))) : [];
    const eventItems = workspace.events.map((event) => ({
      href: `/dashboard/events/${event.id}`,
      label: event.name,
      description: event.orgName,
      group: "Events",
      icon: CalendarDays
    }));
    return [...globalItems, ...destinationItems, ...eventItems];
  }, [currentEvent?.name, eventId, workspace.events, workspaceNav]);

  const sectionLabel = pathname.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ") ?? "Dashboard";
  const isContextRoot = pathname === `/dashboard/events/${currentEvent?.id}` || pathname === `/dashboard/organizations/${currentOrg?.id}`;

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    window.localStorage.setItem("vfurst-sidebar-collapsed", String(next));
  }

  return (
    <div className="vf-app-shell" data-collapsed={collapsed || undefined} data-mobile-open={mobileOpen || undefined} data-app-shell-ready={isReady || undefined}>
      <button className="vf-mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
      <aside className="vf-app-sidebar" aria-label="Organizer workspace">
        <div className="vf-app-sidebar-header">
          <Link className="vf-app-logo" href="/dashboard" onClick={() => setMobileOpen(false)}>
            <span className="vf-app-logo-mark">vF</span>
            <span className="vf-app-logo-word">vFurst</span>
          </Link>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="vf-icon-button" type="button" onClick={toggleCollapsed} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
                {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{collapsed ? "Expand navigation" : "Collapse navigation"}</TooltipContent>
          </Tooltip>
        </div>

        <div className="vf-workspace-switcher">
          <div className="vf-workspace-name">
            <span className="vf-workspace-avatar">{initials(currentEvent?.name ?? currentOrg?.name)}</span>
            <div className="vf-workspace-copy">
              <strong>{currentEvent?.name ?? currentOrg?.name ?? "All workspaces"}</strong>
              <small>{currentEvent?.orgName ?? (currentOrg ? "Organization" : "Organizer console")}</small>
            </div>
          </div>
          <label className="vf-sr-only" htmlFor="vf-organization-switcher">Organization</label>
          <select
            id="vf-organization-switcher"
            className="vf-workspace-select"
            value={currentOrgId ?? ""}
            onChange={(event) => router.push(event.target.value ? `/dashboard/organizations/${event.target.value}` : "/dashboard")}
          >
            <option value="">Choose organization</option>
            {workspace.organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}
          </select>
          <label className="vf-sr-only" htmlFor="vf-event-switcher">Event</label>
          <select
            id="vf-event-switcher"
            className="vf-workspace-select"
            value={eventId ?? ""}
            onChange={(event) => router.push(event.target.value ? `/dashboard/events/${event.target.value}` : "/dashboard/events")}
          >
            <option value="">Choose an event</option>
            {workspace.organizations.map((org) => (
              <optgroup key={org.id} label={org.name}>
                {workspace.events.filter((event) => event.orgId === org.id).map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        <nav className="vf-app-navigation" aria-label="Dashboard navigation">
          {eventId ? (
            <div className="vf-nav-group">
              <p className="vf-nav-group-label">Workspace</p>
              {workspaceNav.map((item) => <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />)}
            </div>
          ) : null}
          {groups.map((group) => (
            <div className="vf-nav-group" key={group.label}>
              <p className="vf-nav-group-label">{group.label}</p>
              {group.items.map((item) => <NavLink key={item.href} item={item} collapsed={collapsed} onNavigate={() => setMobileOpen(false)} />)}
            </div>
          ))}
        </nav>

        <div className="vf-app-sidebar-footer">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="vf-app-user-trigger" type="button">
                <span className="vf-user-avatar">{initials(userName ?? userEmail)}</span>
                <span className="vf-app-user-copy">
                  <strong>{userName ?? "Organizer"}</strong>
                  <span>{userEmail ?? "vFurst account"}</span>
                </span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start">
              <DropdownMenuItem asChild><Link href="/dashboard/settings"><Settings size={16} />Account settings</Link></DropdownMenuItem>
              <form action={logoutAction}>
                <button className="vf-dropdown-item" type="submit"><LogOut size={16} />Log out</button>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="vf-app-content">
        <header className="vf-app-topbar">
          <div className="vf-app-topbar-actions">
            <button className="vf-icon-button vf-mobile-menu-button" type="button" onClick={() => setMobileOpen((value) => !value)} aria-label={mobileOpen ? "Close navigation" : "Open navigation"}>
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <nav className="vf-breadcrumbs" aria-label="Breadcrumb">
              <Link href="/dashboard">Dashboard</Link>
              {currentOrg ? <><ChevronRight size={13} /><Link href={`/dashboard/organizations/${currentOrg.id}`}>{currentOrg.name}</Link></> : null}
              {currentEvent ? <><ChevronRight size={13} /><Link href={`/dashboard/events/${currentEvent.id}`}>{currentEvent.name}</Link></> : null}
              {pathname !== "/dashboard" && !isContextRoot ? <><ChevronRight size={13} /><strong className="vf-capitalize">{sectionLabel}</strong></> : null}
            </nav>
          </div>
          <button ref={commandTriggerRef} className="vf-command-trigger" type="button" onClick={() => setCommandOpen(true)} aria-label="Search navigation">
            <Search size={16} aria-hidden="true" />
            <span>Search navigation</span>
            <kbd className="vf-command-hint">Ctrl K</kbd>
          </button>
        </header>
        <main className="vf-dashboard-main" id="main-content">
          {currentOrg && currentOrg.status !== "ACTIVE" ? (
            <Alert variant="warning">
              <strong>{currentOrg.name} is {currentOrg.status.toLowerCase()}.</strong>{" "}
              Existing records remain visible, but new organizer and public activity is disabled.
            </Alert>
          ) : null}
          {children}
        </main>
      </div>
      <DashboardCommandMenu open={commandOpen} onOpenChange={setCommandOpen} items={commandItems} restoreFocus={() => commandTriggerRef.current?.focus()} />
    </div>
  );
}
