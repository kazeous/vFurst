import { MarketingShell } from "@/components/marketing/marketing-shell";

export const metadata = {
  title: "Privacy Policy | vFurst",
  description: "Privacy Policy for vFurst convention management SaaS."
};

export default function PrivacyPage() {
  return (
    <MarketingShell
      eyebrow="Legal"
      title="Privacy Policy"
      description="How vFurst handles organizer, attendee, vendor, volunteer, and operational data."
    >
      <article className="vf-legal-document">
        <p>Effective date: July 7, 2026</p>
        <h2>Information we collect</h2>
        <p>
          vFurst collects account details, organization details, event configuration, attendee registration data, hotel booking data,
          store and vendor order records, volunteer and vendor application data, badge metadata, operational notes, API usage, webhook
          delivery metadata, and diagnostic information needed to run the service.
        </p>
        <h2>How we use information</h2>
        <p>
          We use information to provide convention management workflows, authenticate users, enforce permissions, process payments through
          Stripe, send transactional email, support organizer operations, prevent abuse, monitor reliability, and improve the product.
        </p>
        <h2>Payments</h2>
        <p>
          Card data is handled by Stripe. vFurst stores payment references, order totals, platform fee amounts, and fulfillment status, but
          does not store full payment card numbers or security codes.
        </p>
        <h2>Subprocessors</h2>
        <p>
          The service may use infrastructure, email, file storage, analytics, error monitoring, and payment providers to deliver the
          product. Organizers are responsible for configuring their own email, payment, and public event data according to their policies.
        </p>
        <h2>Retention and deletion</h2>
        <p>
          Account and event records are retained while an organization uses vFurst. Deletion, export, and correction requests should be sent
          to the organization that operates the relevant event or to vFurst support for platform account data.
        </p>
        <h2>Contact</h2>
        <p>Questions about this policy can be sent to privacy@vfurst.app.</p>
      </article>
    </MarketingShell>
  );
}
