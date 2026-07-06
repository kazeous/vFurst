import { updateOrganization } from "@/actions/org-actions";
import { prisma } from "@vfurst/db";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { notFound } from "next/navigation";

type EmailSettings = {
  host?: string;
  port?: number;
  user?: string;
  fromEmail?: string;
};

export default async function OrganizationSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const org = await prisma.organization.findUnique({
    where: {
      id: orgId
    }
  });

  if (!org) {
    notFound();
  }

  const emailSettings = org.emailSettings as EmailSettings;

  return (
    <div className="vf-page vf-narrow">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Organization settings</p>
          <h1>{org.name}</h1>
        </div>
      </header>
      <Card>
        <form action={updateOrganization} className="vf-form">
          <input type="hidden" name="orgId" value={org.id} />
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
          <Button label="Save settings" type="submit" variant="primary" />
        </form>
      </Card>
    </div>
  );
}

