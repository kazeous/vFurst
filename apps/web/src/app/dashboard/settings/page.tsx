import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireDashboardUser } from "@/lib/dashboard-access";
import { prisma } from "@vfurst/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const userId = await requireDashboardUser();
  const memberships = await prisma.orgMember.findMany({
    where: {
      userId,
      role: {
        in: ["OWNER", "ADMIN"]
      }
    },
    include: {
      org: {
        include: {
          events: {
            orderBy: {
              startDate: "desc"
            }
          }
        }
      }
    },
    orderBy: {
      createdAt: "asc"
    }
  });

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Settings</p>
          <h1>Organizer settings</h1>
          <p className="vf-muted">Choose an organization or event to configure.</p>
        </div>
      </header>

      {memberships.length > 0 ? (
        <section className="vf-stack" aria-label="Manageable organizations">
          {memberships.map((membership) => (
            <Card key={membership.orgId}>
              <div className="vf-stack">
                <div className="vf-page-header">
                  <div>
                    <p className="vf-label">{membership.role}</p>
                    <h2>{membership.org.name}</h2>
                  </div>
                  <Button label="Organization settings" href={`/dashboard/organizations/${membership.orgId}/settings`} />
                </div>

                <div className="vf-list">
                  {membership.org.events.map((event) => (
                    <div key={event.id} className="vf-list-row">
                      <span>{event.name}</span>
                      <small>{event.status}</small>
                      <Button label="Event settings" href={`/dashboard/events/${event.id}/settings`} size="sm" />
                    </div>
                  ))}
                  {membership.org.events.length === 0 ? <p className="vf-empty">This organization has no events yet.</p> : null}
                </div>
              </div>
            </Card>
          ))}
        </section>
      ) : (
        <section className="vf-section">
          <h2>No settings available</h2>
          <p className="vf-muted">You need an owner or administrator role to manage organization and event settings.</p>
          <Button label="View organizations" href="/dashboard/organizations" variant="primary" />
        </section>
      )}
    </div>
  );
}
