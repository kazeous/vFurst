import { updatePortalProfile } from "@/actions/account-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { Button } from "@/components/ui/button";
import { requirePortalPageContext } from "@/lib/portal-context";

export default async function AccountProfilePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const context = await requirePortalPageContext(orgSlug, "/account/profile");

  return (
    <section className="vf-section">
      <p className="vf-label">Identity</p>
      <h2>Profile</h2>
      <p className="vf-muted">This identity owns your public registrations, orders, bookings, and applications.</p>
      <ActionStateForm action={updatePortalProfile} className="vf-form">
        <label>Display name<input name="name" defaultValue={context.account.name ?? ""} required maxLength={120} /></label>
        <p>Email: {context.account.email}</p>
        <small id="account-email-note" className="vf-muted">Email changes require a verified account-recovery flow and are not available here.</small>
        <Button label="Save profile" type="submit" variant="primary" />
      </ActionStateForm>
    </section>
  );
}
