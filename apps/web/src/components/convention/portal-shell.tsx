import { getEffectiveEventBranding } from "@/lib/event-branding";
import { formatDateRange } from "@/lib/i18n";
import type { Prisma } from "@vfurst/db";
import { ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { PortalLink } from "./portal-link";
import { PortalNav } from "./portal-nav";

type PortalOrganization = { name: string; subdomain: string; logo: string | null };
type PortalEvent = { name: string; venue: string | null; startDate: Date; endDate: Date; settings: Prisma.JsonValue } | null;

function initials(value: string) {
  return value.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function imageStyle(url?: string) {
  return url ? { backgroundImage: `url("${url.replaceAll('"', "%22")}")` } : undefined;
}

export function ConventionPortalShell({ org, event, children }: { org: PortalOrganization; event: PortalEvent; children: ReactNode }) {
  const branding = getEffectiveEventBranding(event?.settings ?? {}, org.logo);
  const shellStyle = {
    "--event-accent": branding.accentColor,
    "--event-accent-foreground": branding.accentForeground
  } as CSSProperties;

  return (
    <div className="vf-portal-shell" style={shellStyle}>
      <header className="vf-portal-header">
        <div className="vf-portal-topbar">
          <PortalLink className="vf-portal-identity" subdomain={org.subdomain}>
            <span className="vf-portal-logo" style={imageStyle(branding.logoUrl)}>{branding.logoUrl ? null : initials(event?.name ?? org.name)}</span>
            <span><strong>{event?.name ?? org.name}</strong><small>Official convention portal</small></span>
          </PortalLink>
          <Link className="vf-portal-powered" href="/">Powered by <strong>vFurst</strong></Link>
        </div>
        <PortalNav subdomain={org.subdomain} />
      </header>

      {event ? (
        <section className="vf-portal-event-banner" style={imageStyle(branding.coverImageUrl)} aria-label={`${event.name} event details`}>
          <div className="vf-portal-event-banner-inner">
            <div>
              <p>{org.name}</p>
              <h1>{event.name}</h1>
              <span>{formatDateRange(event.startDate, event.endDate)}{event.venue ? <><i>·</i><MapPin size={15} aria-hidden="true" />{event.venue}</> : null}</span>
            </div>
            <PortalLink className="vf-portal-primary-action" subdomain={org.subdomain} suffix="/register">Get tickets <ArrowRight size={17} /></PortalLink>
          </div>
        </section>
      ) : null}

      {children}

      <footer className="vf-portal-footer">
        <span>{event?.name ?? org.name}</span>
        <div><PortalLink subdomain={org.subdomain} suffix="/register">Tickets</PortalLink><PortalLink subdomain={org.subdomain} suffix="/volunteer">Volunteer</PortalLink><Link href="/privacy">Privacy</Link></div>
        <small>Secure registration and payments by vFurst.</small>
      </footer>
    </div>
  );
}
