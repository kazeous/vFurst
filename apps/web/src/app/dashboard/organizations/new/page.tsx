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
            Logo URL
            <input name="logo" type="url" placeholder="https://..." />
          </label>
          <Button label="Create organization" type="submit" variant="primary" />
        </form>
      </Card>
    </div>
  );
}
