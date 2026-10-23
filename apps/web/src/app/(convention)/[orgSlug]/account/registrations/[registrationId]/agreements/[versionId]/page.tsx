import { ConstrainedMarkdown } from "@/components/constrained-markdown";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/i18n";
import { requirePortalPageContext } from "@/lib/portal-context";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";
import { z } from "zod";

export default async function AccountAgreementVersionPage({ params }: {
  params: Promise<{ orgSlug: string; registrationId: string; versionId: string }>;
}) {
  const { orgSlug, registrationId, versionId } = await params;
  const { org, account } = await requirePortalPageContext(orgSlug, `/account/registrations/${registrationId}/agreements/${versionId}`);
  if (!z.string().uuid().safeParse(registrationId).success || !z.string().uuid().safeParse(versionId).success) notFound();
  const registration = await prisma.registration.findFirst({
    where: { id: registrationId, orgId: org.id, portalAccountId: account.id },
    select: {
      agreements: {
        where: { orgId: org.id, documentVersionId: versionId },
        select: { version: { select: { title: true, version: true, body: true, publishedAt: true } } }
      }
    }
  });
  const version = registration?.agreements[0]?.version;
  if (!version) notFound();
  return <section className="vf-section vf-stack">
    <h2>{version.title}</h2>
    <p className="vf-muted">Version {version.version}, published {formatDate(version.publishedAt, { dateStyle: "medium", timeStyle: "short" })}</p>
    <ConstrainedMarkdown source={version.body} baseLevel={3} />
    <Button label="Back to registration" href={`/account/registrations/${registrationId}`} />
  </section>;
}
