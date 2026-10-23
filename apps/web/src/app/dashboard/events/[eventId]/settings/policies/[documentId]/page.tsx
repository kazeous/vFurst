import { publishPolicyVersion } from "@/actions/policy-document-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { ConstrainedMarkdown } from "@/components/constrained-markdown";
import { PolicyEditorFields } from "@/components/policies/policy-editor-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireEventPageAccess } from "@/lib/dashboard-access";
import { formatDate } from "@/lib/i18n";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";

export default async function PolicyDocumentPage({ params, searchParams }: {
  params: Promise<{ eventId: string; documentId: string }>;
  searchParams: Promise<{ version?: string; published?: string }>;
}) {
  const { eventId, documentId } = await params;
  const { version, published } = await searchParams;
  const { event } = await requireEventPageAccess(eventId);
  const document = await prisma.policyDocument.findFirst({
    where: { id: documentId, orgId: event.orgId, eventId: event.id },
    include: { versions: { orderBy: { version: "desc" } } }
  });
  const latest = document?.versions[0];
  if (!document || !latest) notFound();
  const viewing = version !== undefined;
  const selected = viewing ? document.versions.find((item) => String(item.version) === version) : latest;
  if (!selected) notFound();
  const publishedVersion = document.versions.find((item) => String(item.version) === published);
  const path = `/dashboard/events/${event.id}/settings/policies/${document.id}`;

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div><p className="vf-label">Event settings</p><h1>{latest.title}</h1></div>
        <Button label="Policies" href={`/dashboard/events/${event.id}/settings/policies`} />
      </header>
      {viewing ? <div className="vf-banner" role="status">{`You are viewing version ${selected.version}, published ${formatDate(selected.publishedAt, { dateStyle: "medium", timeStyle: "short" })}.`}</div> : null}
      {publishedVersion ? <div className="vf-banner vf-banner-success" role="status">{`Version ${publishedVersion.version} published.`}</div> : null}
      <Card>
        {viewing ? (
          <section aria-label={selected.title}>
            <h2>{selected.title}</h2>
            <ConstrainedMarkdown source={selected.body} baseLevel={3} />
            <Button label="Edit" href={path} />
          </section>
        ) : (
          <ActionStateForm action={publishPolicyVersion} className="vf-form">
            <input type="hidden" name="documentId" value={document.id} />
            <PolicyEditorFields key={latest.id} title={latest.title} body={latest.body} />
            <Button label={`Publish version ${latest.version + 1}`} type="submit" variant="primary" />
          </ActionStateForm>
        )}
      </Card>
      <Card>
        <h2>Version history</h2>
        <ul>
          {document.versions.map((item) => (
            <li key={item.id}>
              {`Version ${item.version} · ${formatDate(item.publishedAt, { dateStyle: "medium", timeStyle: "short" })}`} {" "}
              <Button label="View" href={`${path}?version=${item.version}`} variant="link" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
