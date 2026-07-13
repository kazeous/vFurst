import { deleteWebhookEndpoint, saveWebhookEndpoint, testWebhookEndpoint } from "@/actions/saas-actions";
import { requireOrgPageAccess } from "@/lib/dashboard-access";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhook-events";
import { webhookQueue } from "@/lib/webhook-queue";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

async function getRecentWebhookJobs(orgId: string) {
  try {
    const jobs = await webhookQueue.getJobs(["completed", "failed", "waiting", "delayed", "active"], 0, 20, false);
    return jobs.filter((job) => job.data.orgId === orgId);
  } catch {
    return [];
  }
}

export default async function WebhooksPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  await requireOrgPageAccess(orgId);

  const [org, jobs] = await Promise.all([
    prisma.organization.findUnique({
      where: {
        id: orgId
      },
      include: {
        webhookEndpoints: {
          orderBy: {
            createdAt: "desc"
          }
        }
      }
    }),
    getRecentWebhookJobs(orgId)
  ]);

  if (!org) {
    notFound();
  }

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Outbound events</p>
          <h1>{org.name} webhooks</h1>
        </div>
        <Button label="Webhook docs" href="/docs/webhooks" />
      </header>
      <section className="vf-two-column">
        <Card>
          <form action={saveWebhookEndpoint} className="vf-form">
            <input type="hidden" name="orgId" value={org.id} />
            <h2>Add endpoint</h2>
            <label>
              Endpoint URL
              <input name="url" type="url" placeholder="https://example.com/vfurst/webhook" required />
            </label>
            <label>
              Signing secret
              <input name="secret" placeholder="Generated automatically if blank" />
            </label>
            <fieldset className="vf-fieldset">
              <legend>Events</legend>
              {WEBHOOK_EVENT_TYPES.map((event) => (
                <label key={event} className="vf-check">
                  <input name="events" type="checkbox" value={event} defaultChecked={event === "registration.created" || event === "order.paid"} />
                  {event}
                </label>
              ))}
            </fieldset>
            <label className="vf-check">
              <input name="active" type="checkbox" defaultChecked />
              Active
            </label>
            <Button label="Save endpoint" type="submit" variant="primary" />
          </form>
        </Card>
        <section className="vf-section">
          <h2>Configured endpoints</h2>
          <div className="vf-list">
            {org.webhookEndpoints.map((endpoint) => (
              <details key={endpoint.id} className="vf-detail-card">
                <summary>
                  <strong>{endpoint.url}</strong>
                  <small>{endpoint.active ? "Active" : "Paused"}</small>
                </summary>
                <form action={saveWebhookEndpoint} className="vf-form">
                  <input type="hidden" name="orgId" value={org.id} />
                  <input type="hidden" name="endpointId" value={endpoint.id} />
                  <label>
                    Endpoint URL
                    <input name="url" type="url" defaultValue={endpoint.url} required />
                  </label>
                  <label>
                    Rotate signing secret
                    <input name="secret" placeholder="Leave blank to keep current secret" />
                  </label>
                  <fieldset className="vf-fieldset">
                    <legend>Events</legend>
                    {WEBHOOK_EVENT_TYPES.map((event) => (
                      <label key={event} className="vf-check">
                        <input name="events" type="checkbox" value={event} defaultChecked={endpoint.events.includes(event)} />
                        {event}
                      </label>
                    ))}
                  </fieldset>
                  <label className="vf-check">
                    <input name="active" type="checkbox" defaultChecked={endpoint.active} />
                    Active
                  </label>
                  <Button label="Update" type="submit" size="sm" />
                </form>
                <div className="vf-inline-forms">
                  <form action={testWebhookEndpoint}>
                    <input type="hidden" name="orgId" value={org.id} />
                    <input type="hidden" name="endpointId" value={endpoint.id} />
                    <Button label="Test" type="submit" size="sm" />
                  </form>
                  <form action={deleteWebhookEndpoint}>
                    <input type="hidden" name="orgId" value={org.id} />
                    <input type="hidden" name="endpointId" value={endpoint.id} />
                    <Button label="Delete" type="submit" size="sm" variant="destructive" />
                  </form>
                </div>
              </details>
            ))}
            {org.webhookEndpoints.length === 0 ? <p className="vf-empty">No webhook endpoints configured yet.</p> : null}
          </div>
        </section>
      </section>
      <section className="vf-section">
        <h2>Delivery log</h2>
        <div className="vf-table">
          <div className="vf-table-head vf-four-col">
            <span>Event</span>
            <span>Status</span>
            <span>Attempts</span>
            <span>Job</span>
          </div>
          {jobs.map((job) => (
            <div key={job.id} className="vf-table-row vf-four-col">
              <span>{job.data.type}</span>
              <span>{job.failedReason ? "Failed" : job.finishedOn ? "Delivered" : "Queued"}</span>
              <span>{job.attemptsMade}</span>
              <span>{job.id}</span>
            </div>
          ))}
        </div>
        {jobs.length === 0 ? <p className="vf-empty">No webhook delivery jobs recorded yet.</p> : null}
      </section>
    </div>
  );
}
