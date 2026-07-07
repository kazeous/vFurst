import Image from "next/image";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/marketing-shell";

const features = [
  {
    title: "Registration that stays connected",
    body: "Tier pricing, add-ons, vouchers, hotel rooms, and store orders all settle into one attendee record."
  },
  {
    title: "Launch-day check-in",
    body: "Badge queues, QR scanning, cashier flow, express kiosk, and offline replay keep doors moving when the lobby gets loud."
  },
  {
    title: "Vendor and volunteer operations",
    body: "Custom applications, approvals, shift boards, booth assignment, assistants, and booth payment live in the event workspace."
  },
  {
    title: "Platform controls",
    body: "Stripe Connect fees, API keys, webhooks, analytics, custom domains, and reconciliation give organizers production visibility."
  }
];

const proofPoints = [
  "Destination-charge Stripe Connect fee collection",
  "Public REST API and outbound webhooks",
  "WCAG-minded Astryx UI primitives",
  "Local-first Docker stack with cloud migration path"
];

export default function HomePage() {
  return (
    <main className="vf-marketing-home">
      <section className="vf-marketing-hero" aria-labelledby="home-title">
        <Image
          className="vf-marketing-hero-image"
          src="/marketing/launch-hero.png"
          alt="Convention registration desk with badge printer, scanner, badges, and operations dashboard"
          fill
          priority
          sizes="100vw"
        />
        <div className="vf-marketing-hero-shade" />
        <MarketingNav />
        <div className="vf-marketing-hero-copy">
          <p className="vf-label">Convention management SaaS</p>
          <h1 id="home-title">vFurst</h1>
          <p>Manage registration, hotels, stores, vendors, volunteers, badges, check-in, APIs, and fees from one launch-ready workspace.</p>
          <div className="vf-marketing-hero-actions">
            <Link className="vf-marketing-button vf-marketing-button-primary" href="/register">
              Start setup
            </Link>
            <Link className="vf-marketing-button" href="/features">
              Explore features
            </Link>
          </div>
        </div>
      </section>

      <section className="vf-marketing-band vf-marketing-proof" aria-label="Launch proof points">
        {proofPoints.map((point) => (
          <span key={point}>{point}</span>
        ))}
      </section>

      <section className="vf-marketing-section" aria-labelledby="home-features-title">
        <div className="vf-marketing-section-header">
          <p className="vf-label">Operations stack</p>
          <h2 id="home-features-title">Built for the messy middle of convention planning</h2>
          <p>Every flow keeps money movement, staff action, and attendee state connected, so launch week is less brittle.</p>
        </div>
        <div className="vf-marketing-grid">
          {features.map((feature) => (
            <article key={feature.title} className="vf-marketing-card">
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="vf-marketing-band vf-marketing-pricing-strip">
        <div>
          <p className="vf-label">Pricing</p>
          <h2>$1 per attendee, $1 per hotel room, 1% on store and vendor transactions</h2>
        </div>
        <Link className="vf-marketing-button vf-marketing-button-primary" href="/pricing">
          Calculate fees
        </Link>
      </section>
    </main>
  );
}
