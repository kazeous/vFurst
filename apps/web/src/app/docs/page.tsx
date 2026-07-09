import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function DocsHomePage() {
  return (
    <main className="vf-docs-shell">
      <header className="vf-docs-hero">
        <p className="vf-label">vFurst docs</p>
        <h1>Build against your convention data</h1>
        <p>Guides and references for API keys, outbound webhooks, and organizer onboarding.</p>
        <div className="vf-actions">
          <Button label="API reference" href="/docs/api" variant="primary" />
          <Button label="Webhook events" href="/docs/webhooks" />
          <Button label="Onboarding" href="/docs/onboarding" />
        </div>
      </header>
      <section className="vf-docs-grid">
        <Link href="/docs/api" className="vf-doc-card">
          <strong>REST API</strong>
          <span>Bearer authentication, pagination, filters, and rate limits.</span>
        </Link>
        <Link href="/docs/webhooks" className="vf-doc-card">
          <strong>Webhooks</strong>
          <span>Signed delivery payloads, retry behavior, and event catalog.</span>
        </Link>
        <Link href="/docs/onboarding" className="vf-doc-card">
          <strong>Convention checklist</strong>
          <span>Recommended setup sequence for a new organizer.</span>
        </Link>
      </section>
    </main>
  );
}
