export default function OnboardingDocsPage() {
  return (
    <main className="vf-docs-shell">
      <header className="vf-docs-hero">
        <p className="vf-label">Convention onboarding</p>
        <h1>Organizer setup checklist</h1>
      </header>
      <section className="vf-section">
        <ol className="vf-doc-list">
          <li>Create the organization and invite admins.</li>
          <li>Complete Stripe Connect onboarding before paid checkout opens.</li>
          <li>Configure SMTP or SES sender settings.</li>
          <li>Add a custom domain and publish the CNAME/TXT records.</li>
          <li>Create events, registration tiers, hotel blocks, store products, volunteer departments, and vendor booth configuration.</li>
          <li>Create API keys and webhook endpoints for integrations.</li>
          <li>Run billing reconciliation before launch and after high-volume sales periods.</li>
        </ol>
      </section>
    </main>
  );
}
