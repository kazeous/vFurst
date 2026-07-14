import { createOrganization } from "@/actions/org-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requirePlatformAdminPage } from "@/lib/dashboard-access";

export default async function NewOrganizationPage() {
  await requirePlatformAdminPage();

  return (
    <div className="vf-page vf-narrow">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">New tenant</p>
          <h1>Create organization</h1>
        </div>
      </header>
      <Card>
        <form action={createOrganization} className="vf-form">
          <label>
            Name
            <input name="name" required placeholder="Anthro Expo" />
          </label>
          <label>
            Subdomain slug
            <input name="slug" required placeholder="anthro-expo" pattern="[a-z0-9]+(-[a-z0-9]+)*" />
          </label>
          <label>
            Contact email
            <input name="contactEmail" type="email" required placeholder="ops@example.org" />
          </label>
          <label>
            Initial owner email
            <input name="ownerEmail" type="email" required placeholder="owner@example.org" />
          </label>
          <p className="vf-muted">The owner receives a single-use invitation. Creating the tenant does not grant membership to the platform operator.</p>
          <label>
            Logo URL
            <input name="logo" type="url" placeholder="https://..." />
          </label>
          <Button label="Create organization" type="submit" variant="primary" />
        </form>
      </Card>
    </div>
  );
}
