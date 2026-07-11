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
    price: "$1 / VND fee + 1%",
    body: "USD events use one dollar per attendee or hotel booking. VND registration and hotel fees are platform-configured; store and vendor payments remain one percent."
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
      description="Stripe fees settle through Connect. SePay VND funds are received centrally by vFurst, credited to the organizer ledger after fees, and paid out manually."
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
