import { activateOrganizationCustomDomain, verifyOrganizationCustomDomain } from "@/actions/platform-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { PageHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getCustomDomainRecords } from "@/lib/custom-domain";
import { formatDate } from "@/lib/i18n";
import { prisma, type CustomDomainStatus } from "@vfurst/db";

export const dynamic = "force-dynamic";

function domainStatusVariant(status: CustomDomainStatus | null) {
  if (status === "ACTIVE" || status === "VERIFIED") return "success" as const;
  if (status === "PENDING_VERIFICATION") return "warning" as const;
  return "neutral" as const;
}

function domainStatusLabel(status: CustomDomainStatus | null) {
  if (status === "PENDING_VERIFICATION") return "Pending DNS verification";
  if (status === "VERIFIED") return "Verified, awaiting activation";
  if (status === "ACTIVE") return "Active";
  if (status === "REJECTED") return "Rejected";
  if (status === "DISABLED") return "Disabled";
  return "No request";
}

export default async function PlatformDomainsPage() {
  const organizations = await prisma.organization.findMany({
    where: {
      OR: [
        { requestedCustomDomain: { not: null } },
        { customDomain: { not: null } }
      ]
    },
    include: {
      customDomainVerifiedBy: { select: { name: true, email: true } },
      customDomainActivatedBy: { select: { name: true, email: true } }
    },
    orderBy: [
      { customDomainStatus: "asc" },
      { updatedAt: "desc" }
    ]
  });

  return (
    <div className="vf-page">
      <PageHeader
        eyebrow="Platform routing"
        title="Custom domains"
        description="Organizers submit hostnames and configure DNS. Only the platform operator can verify ownership and activate public routing."
      />

      {organizations.length === 0 ? (
        <EmptyState
          title="No custom-domain requests"
          description="New organizer requests will appear here without changing public routing."
        />
      ) : (
        <section className="vf-stack" aria-label="Custom-domain requests">
          {organizations.map((org) => {
            const records = org.requestedCustomDomain
              ? getCustomDomainRecords(org.id, org.requestedCustomDomain)
              : null;
            const canVerify = Boolean(records && org.customDomainStatus === "PENDING_VERIFICATION");
            const canActivate = Boolean(
              records &&
              org.customDomainStatus === "VERIFIED" &&
              org.customDomainVerifiedAt &&
              org.status === "ACTIVE"
            );

            return (
              <Card className="vf-section" padding={4} key={org.id}>
                <div className="vf-page-header">
                  <div>
                    <p className="vf-label">{org.status} organization</p>
                    <h2>{org.name}</h2>
                    <p className="vf-muted">{org.requestedCustomDomain ?? "No pending hostname"}</p>
                  </div>
                  <Badge label={domainStatusLabel(org.customDomainStatus)} variant={domainStatusVariant(org.customDomainStatus)} />
                </div>

                <dl className="vf-details">
                  <dt>Requested domain</dt>
                  <dd>{org.requestedCustomDomain ?? "None"}</dd>
                  <dt>Active public domain</dt>
                  <dd>{org.customDomain ?? "Platform subdomain only"}</dd>
                  <dt>Verified</dt>
                  <dd>
                    {org.customDomainVerifiedAt
                      ? `${formatDate(org.customDomainVerifiedAt)} by ${org.customDomainVerifiedBy?.name ?? org.customDomainVerifiedBy?.email ?? "platform operator"}`
                      : "Not yet"}
                  </dd>
                  <dt>Activated</dt>
                  <dd>
                    {org.customDomainActivatedAt
                      ? `${formatDate(org.customDomainActivatedAt)} by ${org.customDomainActivatedBy?.name ?? org.customDomainActivatedBy?.email ?? "platform operator"}`
                      : "Not yet"}
                  </dd>
                </dl>

                {records ? (
                  <dl className="vf-details">
                    <dt>CNAME</dt>
                    <dd>{records.cnameName} → {records.cnameValue}</dd>
                    <dt>Ownership TXT</dt>
                    <dd>{records.txtName} → {records.txtValue}</dd>
                  </dl>
                ) : null}

                <div className="vf-actions">
                  <Button label="Open organization" href={`/platform/organizations/${org.id}`} />
                  {canVerify ? (
                    <ActionStateForm action={verifyOrganizationCustomDomain} errorTestId="domain-verification-error">
                      <input type="hidden" name="orgId" value={org.id} />
                      <Button label="Verify DNS ownership" type="submit" variant="primary" />
                    </ActionStateForm>
                  ) : null}
                  {org.customDomainStatus === "VERIFIED" ? (
                    <ActionStateForm action={activateOrganizationCustomDomain}>
                      <input type="hidden" name="orgId" value={org.id} />
                      <Button
                        label="Activate public routing"
                        type="submit"
                        variant="primary"
                        isDisabled={!canActivate}
                      />
                    </ActionStateForm>
                  ) : null}
                </div>
                {org.customDomainStatus === "VERIFIED" && org.status !== "ACTIVE" ? (
                  <p className="vf-muted">Activate the organization service before enabling custom-domain routing.</p>
                ) : null}
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
