import { MarketingShell } from "@/components/marketing/marketing-shell";

export const metadata = {
  title: "Terms of Service | vFurst",
  description: "Terms of Service for vFurst convention management SaaS."
};

export default function TermsPage() {
  return (
    <MarketingShell eyebrow="Legal" title="Terms of Service" description="The terms that govern access to and use of vFurst.">
      <article className="vf-legal-document">
        <p>Effective date: July 7, 2026</p>
        <h2>Use of the service</h2>
        <p>
          vFurst provides software for convention and event management. Users must provide accurate account information, maintain the
          security of their credentials, and use the service only for lawful event operations.
        </p>
        <h2>Organizer responsibilities</h2>
        <p>
          Organizers are responsible for event content, pricing, refund policies, attendee communication, vendor and volunteer decisions,
          tax obligations, accessibility obligations, and compliance with laws that apply to their events.
        </p>
        <h2>Payments and fees</h2>
        <p>
          Payments are processed by Stripe Connect. Platform fees are collected through Stripe application fees at checkout according to the
          pricing page. Organizers must keep their Stripe account in good standing to accept paid orders.
        </p>
        <h2>Acceptable use</h2>
        <p>
          Users may not attempt to bypass access controls, overload the service, upload malicious content, infringe intellectual property,
          scrape restricted data, or use vFurst to facilitate unlawful activity.
        </p>
        <h2>Availability</h2>
        <p>
          vFurst is provided with commercially reasonable care, but launch-day operations depend on user devices, networks, payment
          providers, email providers, and other services outside vFurst's direct control.
        </p>
        <h2>Termination</h2>
        <p>We may suspend or terminate access for material violations, security risk, nonpayment, or unlawful use.</p>
      </article>
    </MarketingShell>
  );
}
