import { updateEventBranding } from "@/actions/branding-actions";
import { PageHeader } from "@/components/dashboard/page-header";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getEffectiveEventBranding, getStoredEventBranding } from "@/lib/event-branding";
import { requireEventPageAccess } from "@/lib/dashboard-access";
import { formatDateRange } from "@/lib/i18n";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";

export default async function EventBrandingPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { eventId } = await params;
  const { saved } = await searchParams;
  await requireEventPageAccess(eventId);
  const event = await prisma.event.findUnique({ where: { id: eventId }, include: { org: true } });
  if (!event) notFound();

  const stored = getStoredEventBranding(event.settings);
  const effective = getEffectiveEventBranding(event.settings, event.org.logo);
  const previewStyle = {
    "--event-accent": effective.accentColor,
    "--event-accent-foreground": effective.accentForeground,
    backgroundImage: effective.coverImageUrl ? `linear-gradient(90deg, rgb(16 28 23 / 78%), rgb(16 28 23 / 20%)), url("${effective.coverImageUrl.replaceAll('"', "%22")}")` : undefined
  } as React.CSSProperties;

  return (
    <div className="vf-page">
      <PageHeader eyebrow="Event settings" title="Branding" description="Give the public convention portal a recognizable identity while vFurst protects contrast and layout quality." />
      {saved === "1" ? <Alert variant="success">Event branding saved and applied to the public portal.</Alert> : null}
      <section className="vf-branding-layout">
        <Card>
          <form action={updateEventBranding} className="vf-form" encType="multipart/form-data">
            <input type="hidden" name="eventId" value={event.id} />
            <div><p className="vf-label">Identity</p><h2>Event artwork</h2><p className="vf-muted">Use wide, high-resolution imagery. Uploaded files are stored with the event.</p></div>
            <label>Logo URL<input name="logoUrl" type="url" defaultValue={stored.logoUrl ?? ""} placeholder={event.org.logo ?? "https://…"} /></label>
            <label>Upload logo<input name="logoFile" type="file" accept="image/png,image/jpeg,image/webp" /><small className="vf-muted">PNG, JPEG, or WebP · up to 2 MB</small></label>
            {stored.logoUrl ? <label className="vf-check"><input name="removeLogo" type="checkbox" />Remove the event logo and use the organization fallback</label> : null}
            <label>Cover image URL<input name="coverImageUrl" type="url" defaultValue={stored.coverImageUrl ?? ""} placeholder="https://…" /></label>
            <label>Upload cover image<input name="coverFile" type="file" accept="image/png,image/jpeg,image/webp" /><small className="vf-muted">PNG, JPEG, or WebP · up to 6 MB · wide landscape recommended</small></label>
            {stored.coverImageUrl ? <label className="vf-check"><input name="removeCover" type="checkbox" />Remove the cover image</label> : null}
            <label>Accent color<div className="vf-color-field"><input name="accentColor" type="color" defaultValue={effective.accentColor} /><code>{effective.accentColor}</code></div><small className="vf-muted">Button text is selected automatically to meet WCAG AA contrast.</small></label>
            <Button label="Save branding" type="submit" variant="primary" />
          </form>
        </Card>
        <div className="vf-brand-preview-wrap">
          <p className="vf-label">Live preview</p>
          <div className="vf-brand-preview" style={previewStyle}>
            <div className="vf-brand-preview-nav"><span>vFurst event portal</span><span>Tickets · Hotel · Shop</span></div>
            <div className="vf-brand-preview-body">
              <div className="vf-brand-preview-logo" style={effective.logoUrl ? { backgroundImage: `url("${effective.logoUrl.replaceAll('"', "%22")}")` } : undefined}>{effective.logoUrl ? null : event.name.slice(0, 2).toUpperCase()}</div>
              <p>{event.org.name}</p>
              <h2>{event.name}</h2>
              <span>{formatDateRange(event.startDate, event.endDate)}{event.venue ? ` · ${event.venue}` : ""}</span>
              <button type="button">Get tickets</button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
