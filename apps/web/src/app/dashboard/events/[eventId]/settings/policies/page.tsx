import { archivePolicyDocument, movePolicyDocument, restorePolicyDocument } from "@/actions/policy-document-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireEventPageAccess } from "@/lib/dashboard-access";
import { formatDate } from "@/lib/i18n";
import { prisma } from "@vfurst/db";

export default async function PoliciesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event } = await requireEventPageAccess(eventId);
  const documents = await prisma.policyDocument.findMany({
    where: { orgId: event.orgId, eventId: event.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { versions: { orderBy: { version: "desc" }, take: 1 }, _count: { select: { agreements: true } } }
  });
  const active = documents.filter((document) => !document.archivedAt);
  const archived = documents.filter((document) => document.archivedAt);
  const path = `/dashboard/events/${event.id}/settings/policies`;

  function documentRow(document: typeof documents[number], index: number, isArchived: boolean) {
    const latest = document.versions[0];
    if (!latest) return null;
    const count = document._count.agreements;
    return (
      <Card key={document.id}>
        <h2>{latest.title}</h2>
        <p className="vf-muted">{`Version ${latest.version} · published ${formatDate(latest.publishedAt, { dateStyle: "medium", timeStyle: "short" })} · ${count} agreement${count === 1 ? "" : "s"}`}</p>
        <div className="vf-actions">
          <Button label="Edit" href={`${path}/${document.id}`} />
          {isArchived ? (
            <ActionStateForm action={restorePolicyDocument}>
              <input type="hidden" name="documentId" value={document.id} />
              <Button label="Restore" type="submit" />
            </ActionStateForm>
          ) : (
            <>
              {(["up", "down"] as const).map((direction) => (
                <ActionStateForm key={direction} action={movePolicyDocument}>
                  <input type="hidden" name="documentId" value={document.id} />
                  <input type="hidden" name="direction" value={direction} />
                  <Button label={direction === "up" ? "Move up" : "Move down"} type="submit" disabled={direction === "up" ? index === 0 : index === active.length - 1} />
                </ActionStateForm>
              ))}
              <ActionStateForm action={archivePolicyDocument}>
                <input type="hidden" name="documentId" value={document.id} />
                <Button label="Archive" type="submit" />
              </ActionStateForm>
            </>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Event settings</p>
          <h1>Policies</h1>
          <p className="vf-muted">Attendees must agree to every published policy before registering.</p>
        </div>
        <Button label="New document" href={`${path}/new`} variant="primary" />
      </header>
      {active.length ? active.map((document, index) => documentRow(document, index, false)) : <p className="vf-muted">No policies yet.</p>}
      {archived.length ? (
        <section aria-labelledby="archived-policies">
          <h2 id="archived-policies">Archived</h2>
          {archived.map((document, index) => documentRow(document, index, true))}
        </section>
      ) : null}
    </div>
  );
}
