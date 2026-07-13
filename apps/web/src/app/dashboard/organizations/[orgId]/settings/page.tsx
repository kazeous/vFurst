import { updateCustomDomain, updateOrganization, verifyCustomDomain } from "@/actions/org-actions";
import { getCustomDomainRecords, isCustomDomainVerified } from "@/lib/custom-domain";
import { requireOrgPageAccess } from "@/lib/dashboard-access";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { notFound } from "next/navigation";

type EmailSettings = {
  host?: string;
  port?: number;
  user?: string;
  fromEmail?: string;
};

export default async function OrganizationSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  await requireOrgPageAccess(orgId);
  const org = await prisma.organization.findUnique({
    where: {
      id: orgId
    }
  });

  if (!org) {
    notFound();
  }

  const emailSettings = org.emailSettings as EmailSettings;
  const domainRecords = org.customDomain ? getCustomDomainRecords(org.id, org.customDomain) : null;
  const domainVerified = org.customDomain ? await isCustomDomainVerified(org.id, org.customDomain) : false;

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Organization settings</p>
          <h1>{org.name}</h1>
        </div>
      </header>
      <section className="vf-two-column">
        <Card>
          <form action={updateOrganization} className="vf-form">
            <input type="hidden" name="orgId" value={org.id} />
            <h2>Organization</h2>
            <label>
              Name
              <input name="name" defaultValue={org.name} required />
            </label>
            <label>
              Subdomain slug
              <input name="slug" defaultValue={org.slug} required />
            </label>
            <label>
              Contact email
              <input name="contactEmail" type="email" defaultValue={org.contactEmail} required />
            </label>
            <label>
              Logo URL
              <input name="logo" type="url" defaultValue={org.logo ?? ""} />
            </label>
            <label>
              Email provider
              <select name="emailProvider" defaultValue={org.emailProvider}>
                <option value="SMTP">SMTP</option>
                <option value="SES">AWS SES</option>
              </select>
            </label>
            <label>
              SMTP host
              <input name="smtpHost" defaultValue={emailSettings.host ?? ""} placeholder="localhost" />
            </label>
            <label>
              SMTP port
              <input name="smtpPort" type="number" defaultValue={emailSettings.port ?? 1025} />
            </label>
            <label>
              SMTP user
              <input name="smtpUser" defaultValue={emailSettings.user ?? ""} />
            </label>
            <label>
              SES from email
              <input name="sesFromEmail" type="email" defaultValue={emailSettings.fromEmail ?? ""} />
            </label>
            <h2>Organizer payouts</h2>
            <p className="vf-muted">Platform administrators use these details for manual SePay settlement transfers.</p>
            <label>
              Payout bank code
              <input name="payoutBankCode" defaultValue={org.payoutBankCode ?? ""} placeholder="Vietcombank" />
            </label>
            <label>
              Payout account number
              <input name="payoutAccountNumber" defaultValue={org.payoutAccountNumber ?? ""} />
            </label>
            <label>
              Payout account holder
              <input name="payoutAccountHolder" defaultValue={org.payoutAccountHolder ?? ""} />
            </label>
            <Button label="Save settings" type="submit" variant="primary" />
          </form>
        </Card>
        <Card>
          <div className="vf-stack">
            <form action={updateCustomDomain} className="vf-form">
              <input type="hidden" name="orgId" value={org.id} />
              <h2>Custom domain</h2>
              <label>
                Domain
                <input name="customDomain" defaultValue={org.customDomain ?? ""} placeholder="con.example.com" />
              </label>
              <Button label="Save domain" type="submit" />
            </form>
            {domainRecords ? (
              <div className="vf-stack">
                <div className={`vf-banner ${domainVerified ? "vf-banner-success" : "vf-banner-warning"}`}>
                  {domainVerified ? "DNS ownership verified." : "Waiting for DNS TXT verification."}
                </div>
                <dl className="vf-details">
                  <dt>CNAME name</dt>
                  <dd>{domainRecords.cnameName}</dd>
                  <dt>CNAME value</dt>
                  <dd>{domainRecords.cnameValue}</dd>
                  <dt>TXT name</dt>
                  <dd>{domainRecords.txtName}</dd>
                  <dt>TXT value</dt>
                  <dd>{domainRecords.txtValue}</dd>
                </dl>
                <form action={verifyCustomDomain}>
                  <input type="hidden" name="orgId" value={org.id} />
                  <input type="hidden" name="customDomain" value={domainRecords.domain} />
                  <Button label="Verify DNS" type="submit" variant="primary" />
                </form>
              </div>
            ) : (
              <p className="vf-muted">Add a CNAME and TXT challenge to route a verified custom domain to this convention portal.</p>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
