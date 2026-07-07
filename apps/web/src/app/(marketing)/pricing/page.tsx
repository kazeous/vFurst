import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PricingCalculator } from "./pricing-calculator";

const tiers = [
  {
    name: "Beta",
    price: "Free setup",
    body: "For launch partners validating real convention workflows before public launch."
  },
  {
    name: "Usage",
    price: "$1 + 1%",
    body: "One dollar per attendee, one dollar per hotel booking, and one percent on store and vendor payments."
  },
  {
    name: "Platform",
    price: "Included",
    body: "Custom domains, API keys, webhooks, analytics, badge tooling, and reconciliation are included in the product surface."
  }
];

export const metadata = {
  title: "Pricing | vFurst",
  description: "Estimate vFurst convention management fees for attendees, hotel rooms, store orders, and vendor transactions."
};

export default function PricingPage() {
  return (
    <MarketingShell
      eyebrow="Pricing"
      title="Simple usage fees for events that move money"
      description="No secondary invoices for platform fees. Fees are collected through Stripe Connect application fees at checkout and audited by reconciliation reports."
    >
      <section className="vf-marketing-grid">
        {tiers.map((tier) => (
          <article key={tier.name} className="vf-marketing-card">
            <p className="vf-label">{tier.name}</p>
            <h2>{tier.price}</h2>
            <p>{tier.body}</p>
          </article>
        ))}
      </section>
      <PricingCalculator />
    </MarketingShell>
  );
}
