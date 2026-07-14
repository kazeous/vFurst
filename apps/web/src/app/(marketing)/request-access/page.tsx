import { MarketingShell } from "@/components/marketing/marketing-shell";
import { ArrowRight, Building2, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Request access | vFurst",
  description: "Request managed onboarding for a vFurst convention organization."
};

export default function RequestAccessPage() {
  const salesEmail = process.env.SALES_CONTACT_EMAIL ?? "sales@vfurst.com";
  const subject = encodeURIComponent("vFurst managed organization request");

  return (
    <MarketingShell
      eyebrow="Managed onboarding"
      title="Tell us about the convention you run"
      description="vFurst does not offer self-service tenant creation. The platform team provisions each organization, assigns its initial owner, and coordinates domain and payment readiness."
    >
      <section className="vf-marketing-grid" aria-label="Managed onboarding steps">
        <article className="vf-marketing-card">
          <Building2 aria-hidden="true" />
          <h2>1. Organization setup</h2>
          <p>We create the tenant and agree on its platform subdomain and service status.</p>
        </article>
        <article className="vf-marketing-card">
          <Mail aria-hidden="true" />
          <h2>2. Owner invitation</h2>
          <p>The nominated owner receives a time-limited invitation. A normal public account cannot create or claim an organization.</p>
        </article>
        <article className="vf-marketing-card">
          <ShieldCheck aria-hidden="true" />
          <h2>3. Readiness review</h2>
          <p>We verify custom-domain and payment prerequisites before your team opens event sales.</p>
        </article>
      </section>
      <section className="vf-home-cta">
        <div>
          <p className="vf-label">Request access</p>
          <h2>Start the provisioning conversation.</h2>
          <p>Include your organization name, expected event dates, attendee scale, preferred domain, and payment currencies.</p>
        </div>
        <Link className="vf-home-button vf-home-button-primary" href={`mailto:${salesEmail}?subject=${subject}`}>
          Email {salesEmail} <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </MarketingShell>
  );
}
