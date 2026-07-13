import Link from "next/link";
import { MarketingNav } from "@/components/marketing/marketing-shell";

const features = [
  {
    index: "01",
    title: "Registration that stays connected",
    body: "Tier pricing, add-ons, vouchers, hotel rooms, and store orders all settle into one attendee record."
  },
  {
    index: "02",
    title: "Launch-day check-in",
    body: "Badge queues, QR scanning, cashier flow, express kiosk, and offline replay keep doors moving when the lobby gets loud."
  },
  {
    index: "03",
    title: "Vendor and volunteer operations",
    body: "Custom applications, approvals, shift boards, booth assignment, assistants, and booth payment live in the event workspace."
  },
  {
    index: "04",
    title: "Platform controls",
    body: "Stripe Connect, embedded SePay VietQR, API keys, webhooks, analytics, custom domains, and reconciliation give organizers production visibility."
  }
];

const proofPoints = [
  "Stripe Connect and embedded SePay VietQR payments",
  "Public REST API and outbound webhooks",
  "WCAG-minded shadcn/ui primitives",
  "Local-first Docker stack with cloud migration path"
];

export default function HomePage() {
  return (
    <main className="vf-marketing-home">
      <section className="vf-marketing-hero" aria-labelledby="home-title">
        <MarketingNav />
        <div className="vf-marketing-hero-inner">
          <div className="vf-marketing-hero-copy">
            <p className="vf-label">Convention management SaaS</p>
            <h1 id="home-title">vFurst</h1>
            <p className="vf-marketing-hero-kicker">Convention operations, minus the chaos.</p>
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
          <div
            className="vf-hero-operations-preview"
            role="img"
            aria-label="Live convention operations dashboard showing registration, check-in, and volunteer staffing"
          >
            <div className="vf-hero-preview-topbar">
              <span className="vf-hero-preview-brand">Launch overview</span>
              <span className="vf-hero-live-status"><i /> Live</span>
            </div>
            <div className="vf-hero-preview-event">
              <div>
                <small>Reyuu Summer Con · Day 1</small>
                <strong>Doors are open</strong>
              </div>
              <span>09:42</span>
            </div>
            <div className="vf-hero-preview-metrics">
              <div>
                <small>Registered</small>
                <strong>1,284</strong>
                <span>+86 today</span>
              </div>
              <div>
                <small>Checked in</small>
                <strong>63%</strong>
                <span>812 guests</span>
              </div>
              <div>
                <small>Open shifts</small>
                <strong>9</strong>
                <span>3 departments</span>
              </div>
            </div>
            <div className="vf-hero-preview-activity">
              <div className="vf-hero-preview-avatar">ML</div>
              <div>
                <strong>Mai Le checked in</strong>
                <span>VIP · Badge 0842</span>
              </div>
              <span className="vf-hero-preview-check">✓</span>
            </div>
            <div className="vf-hero-preview-orbit vf-hero-preview-orbit-left">QR</div>
            <div className="vf-hero-preview-orbit vf-hero-preview-orbit-right">12</div>
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
              <span className="vf-marketing-card-index">{feature.index}</span>
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
