import { generateBadgesForEvent, reprintBadge } from "@/actions/phase5-actions";
import { StatCard } from "@/components/dashboard/stat-card";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BadgesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      badgeTemplates: {
        orderBy: {
          updatedAt: "desc"
        }
      },
      registrations: {
        where: {
          status: {
            in: ["CONFIRMED", "CHECKED_IN"]
          }
        },
        include: {
          badges: {
            include: {
              template: true
            }
          },
          type: true,
          user: true
        },
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  const activeTemplate = event.badgeTemplates[0];
  const badges = event.registrations.flatMap((registration) => registration.badges.map((badge) => ({ ...badge, registration })));
  const printed = badges.filter((badge) => badge.printedAt).length;
  const pending = Math.max(event.registrations.length - printed, 0);

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Badges</p>
          <h1>Print queue</h1>
          <p className="vf-muted">Generate, inspect, and reprint attendee badges for {event.name}.</p>
        </div>
        <div className="vf-actions">
          <Button label="Designer" href={`/dashboard/events/${event.id}/badges/designer`} />
          {activeTemplate ? (
            <form action={generateBadgesForEvent}>
              <input type="hidden" name="orgId" value={event.orgId} />
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="templateId" value={activeTemplate.id} />
              <Button label="Generate batch" type="submit" variant="primary" />
            </form>
          ) : null}
        </div>
      </header>

      <section className="vf-stat-grid">
        <StatCard label="Confirmed attendees" value={event.registrations.length.toString()} detail="Eligible for badge generation" progress={70} />
        <StatCard label="Generated badges" value={badges.length.toString()} detail="Badge records ready" progress={badges.length ? 80 : 10} />
        <StatCard label="Printed badges" value={printed.toString()} detail="Marked printed/reprinted" progress={printed ? 90 : 10} />
        <StatCard label="Queue remaining" value={pending.toString()} detail="Need print or reprint" progress={pending ? 45 : 100} />
      </section>

      {!activeTemplate ? (
        <section className="vf-section">
          <h2>No badge template</h2>
          <p className="vf-muted">Create a template in the designer before generating the print queue.</p>
          <Button label="Open designer" href={`/dashboard/events/${event.id}/badges/designer`} />
        </section>
      ) : null}

      <section className="vf-section">
        <h2>Queue</h2>
        <div className="vf-table">
          <div className="vf-table-head vf-five-col">
            <span>Attendee</span>
            <span>Tier</span>
            <span>Badge</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          {event.registrations.map((registration) => {
            const badge = registration.badges[0];

            return (
              <div key={registration.id} className="vf-table-row vf-five-col">
                <span>{registration.user.name ?? registration.user.email}</span>
                <span>{registration.type.name}</span>
                <span>{badge?.barcodeData ?? "Not generated"}</span>
                <span>{badge?.printedAt ? `Printed ${badge.printedAt.toLocaleString()}` : badge ? "Queued" : "Missing"}</span>
                <span>
                  {badge ? (
                    <form action={reprintBadge}>
                      <input type="hidden" name="orgId" value={event.orgId} />
                      <input type="hidden" name="eventId" value={event.id} />
                      <input type="hidden" name="badgeId" value={badge.id} />
                      <Button label={badge.printedAt ? "Reprint" : "Mark printed"} type="submit" size="sm" />
                    </form>
                  ) : (
                    <small className="vf-muted">Generate batch first</small>
                  )}
                </span>
              </div>
            );
          })}
          {event.registrations.length === 0 ? <p className="vf-empty">Confirmed registrations appear here in registration order.</p> : null}
        </div>
      </section>
    </div>
  );
}
