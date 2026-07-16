import { updatePublicProfile } from "@/actions/account-actions";
import { Button } from "@/components/ui/button";
import { requirePublicAccount } from "@/lib/public-account";

export default async function AccountProfilePage() {
  const user = await requirePublicAccount("/account/profile");

  return (
    <section className="vf-section">
      <p className="vf-label">Identity</p>
      <h2>Profile</h2>
      <p className="vf-muted">This identity owns your public registrations, orders, bookings, and applications.</p>
      <form action={updatePublicProfile} className="vf-form">
        <label>Display name<input name="name" defaultValue={user.name ?? ""} required maxLength={120} /></label>
        <label>Email<input value={user.email} readOnly aria-describedby="account-email-note" /></label>
        <small id="account-email-note" className="vf-muted">Email changes require a verified account-recovery flow and are not available here.</small>
        <Button label="Save profile" type="submit" variant="primary" />
      </form>
    </section>
  );
}
