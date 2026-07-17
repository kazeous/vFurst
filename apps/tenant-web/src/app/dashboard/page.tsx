export default function DashboardPage() {
  return (
    <div className="organizer-welcome">
      <p className="eyebrow">Independent tenant runtime</p>
      <h2>Your organizer access is ready</h2>
      <p>
        This first protected surface reads current memberships and events directly from the shared database. Event
        editing remains on the legacy runtime until its write routes move as one verified unit.
      </p>
      <div className="organizer-boundary" role="note">
        <strong>Read-only cutover boundary</strong>
        <span>No event or organization writes are exposed from this route.</span>
      </div>
    </div>
  );
}
