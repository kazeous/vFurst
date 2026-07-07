import { MarketingShell } from "@/components/marketing/marketing-shell";

const featureGroups = [
  {
    title: "Public attendee flows",
    items: ["Published convention pages", "Registration tiers and scheduled pricing", "Add-ons, vouchers, and unified cart", "Hotel blocks and booking fees"]
  },
  {
    title: "On-site operations",
    items: ["Badge designer and render queue", "Staff check-in with QR search", "Cashier desk for walk-ins", "Express kiosk with offline replay"]
  },
  {
    title: "People and vendors",
    items: ["Volunteer form builder", "Application review and shift assignment", "Vendor applications and booth map", "Assistant, amenity, and booth payment tracking"]
  },
  {
    title: "SaaS platform layer",
    items: ["Stripe Connect onboarding", "Usage and fee reconciliation", "Custom domains", "REST API, API keys, webhooks, and analytics"]
  }
];

export const metadata = {
  title: "Features | vFurst",
  description: "Convention registration, check-in, vendors, volunteers, analytics, API, and Stripe Connect features in vFurst."
};

export default function FeaturesPage() {
  return (
    <MarketingShell
      eyebrow="Features"
      title="One workspace for planning, selling, staffing, and launch day"
      description="vFurst keeps the public convention site, organizer dashboard, payment flows, and on-site tools pointed at the same source of truth."
    >
      <section className="vf-marketing-grid">
        {featureGroups.map((group) => (
          <article key={group.title} className="vf-marketing-card">
            <h2>{group.title}</h2>
            <ul className="vf-marketing-checklist">
              {group.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
      <section className="vf-marketing-band">
        <div>
          <p className="vf-label">Launch controls</p>
          <h2>Production visibility is part of the workflow</h2>
          <p>
            Error monitoring, load tests, security review, accessibility review, legal pages, and critical-path Playwright tests are
            tracked as Phase 7 launch requirements.
          </p>
        </div>
      </section>
    </MarketingShell>
  );
}
