import { WEBHOOK_EVENT_TYPES } from "@/lib/webhook-events";

export default function WebhookDocsPage() {
  return (
    <main className="vf-docs-shell">
      <header className="vf-docs-hero">
        <p className="vf-label">Webhook events</p>
        <h1>Signed outbound events</h1>
        <p>
          vFurst sends JSON envelopes to public HTTPS endpoints and retries transient failures through BullMQ. Each endpoint has its own job and stable delivery ID across retries.
        </p>
      </header>
      <section className="vf-section">
        <h2>Headers</h2>
        <dl className="vf-details">
          <dt>x-vfurst-event</dt>
          <dd>Event type, such as registration.created.</dd>
          <dt>x-vfurst-timestamp</dt>
          <dd>Unix timestamp used in the signature base string.</dd>
          <dt>x-vfurst-signature</dt>
          <dd>HMAC-SHA256 of timestamp.body using the endpoint secret.</dd>
        </dl>
      </section>
      <section className="vf-section">
        <h2>Delivery security</h2>
        <p>
          Verify the timestamp and HMAC against the exact raw body before parsing JSON, compare signatures in constant time, and deduplicate the payload ID. Private/local DNS answers, IP-literal targets, credentials, redirects, and timed-out requests are rejected.
        </p>
      </section>
      <section className="vf-section">
        <h2>Event catalog</h2>
        <div className="vf-token-row">
          {WEBHOOK_EVENT_TYPES.map((event) => (
            <code key={event}>{event}</code>
          ))}
        </div>
      </section>
      <section className="vf-section">
        <h2>Payload shape</h2>
        <pre className="vf-code-block">{`{
  "id": "uuid",
  "type": "registration.created",
  "orgId": "uuid",
  "eventId": "uuid",
  "createdAt": "2026-07-07T00:00:00.000Z",
  "data": { "registrationId": "uuid" }
}`}</pre>
      </section>
    </main>
  );
}
