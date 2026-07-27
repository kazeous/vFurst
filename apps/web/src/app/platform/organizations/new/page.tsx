import { createOrganization } from "@/actions/org-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function NewPlatformOrganizationPage() {
  return (
    <div className="vf-page vf-narrow">
      <header className="vf-page-header"><div><p className="vf-label">New tenant</p><h1>Provision organization</h1><p className="vf-page-description">The tenant remains in provisioning until its invited owner accepts and a platform admin activates service.</p></div></header>
      <Card>
        <ActionStateForm action={createOrganization} className="vf-form" errorTestId="create-organization-error">
          <label>Name<input name="name" required placeholder="Anthro Expo" /></label>
          <label>Subdomain slug<input name="slug" required placeholder="anthro-expo" pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label>
          <label>Contact email<input name="contactEmail" type="email" required placeholder="ops@example.org" /></label>
          <label>Initial owner email<input name="ownerEmail" type="email" required placeholder="owner@example.org" /></label>
          <p className="vf-muted">The owner receives a single-use invitation. Provisioning never grants the platform operator tenant membership.</p>
          <label>Logo URL<input name="logo" type="url" placeholder="https://..." /></label>
          <div className="vf-actions"><Button label="Provision organization" type="submit" variant="primary" /><Button label="Cancel" href="/platform/organizations" /></div>
        </ActionStateForm>
      </Card>
    </div>
  );
}
