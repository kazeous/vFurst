import { MarketingFooter, MarketingNav } from "@/components/marketing/marketing-shell";
import { ArrowRight, BadgeCheck, BarChart3, Hotel, ScanLine, Store, TicketCheck, Users } from "lucide-react";
import Link from "next/link";

const capabilities = [
  { icon: TicketCheck, title: "Registration stays connected", body: "Ticket tiers, add-ons, vouchers, hotels, and orders resolve into one attendee record." },
  { icon: ScanLine, title: "Doors open without drama", body: "QR scanning, badge queues, cashier flow, express kiosk, and offline replay keep lines moving." },
  { icon: Users, title: "People operations in context", body: "Volunteer applications, shift assignments, vendor reviews, booths, and assistants share the event workspace." },
  { icon: BarChart3, title: "Money and signals reconcile", body: "Stripe, SePay, analytics, platform fees, ledgers, APIs, and webhooks stay visible to the right team." }
];

const workflow = [
  { number: "01", title: "Plan", body: "Create the event, ticket inventory, hotel blocks, staff departments, vendor products, and store catalog." },
  { number: "02", title: "Sell", body: "Publish one branded portal for registration, hotel, shop, volunteer, and vendor journeys." },
  { number: "03", title: "Operate", body: "Run check-in, badge printing, cashier desks, shift coordination, and event analytics from one console." }
];

export default function HomePage() {
  return (
    <main className="vf-marketing-home vf-home-v2">
      <section className="vf-home-hero" aria-labelledby="home-title">
        <MarketingNav />
        <div className="vf-home-hero-inner">
          <div className="vf-home-hero-copy">
            <p className="vf-home-eyebrow"><span /> Convention operations platform</p>
            <h1 id="home-title">Run the whole convention from one calm workspace.</h1>
            <p>Manage registration, hotels, stores, vendors, volunteers, badges, check-in, APIs, and fees without stitching together spreadsheets and point tools.</p>
            <div className="vf-home-actions"><Link className="vf-home-button vf-home-button-primary" href="/request-access">Request managed access <ArrowRight size={17} /></Link><Link className="vf-home-button" href="/features">See how it works</Link></div>
            <div className="vf-home-trust"><span><BadgeCheck size={16} />Built for live event pressure</span><span><BadgeCheck size={16} />WCAG-minded workflows</span></div>
          </div>

          <div className="vf-hero-operations-preview vf-home-product-preview" role="img" aria-label="Convention operations dashboard showing registration, check-in, and volunteer staffing">
            <div className="vf-home-preview-chrome"><span><i /><i /><i /></span><small>Operations · Reyuu Summer Con</small><b>Event day</b></div>
            <div className="vf-home-preview-layout">
              <aside><strong>vF</strong><span /><span /><span data-active="true" /><span /><span /></aside>
              <div className="vf-home-preview-content">
                <header><div><small>Saturday, July 18</small><h2>Doors are open</h2></div><span>09:42</span></header>
                <div className="vf-home-preview-stats"><article><small>Registered</small><strong>1,284</strong><em>+86 today</em></article><article><small>Checked in</small><strong>63%</strong><em>812 guests</em></article><article><small>Open shifts</small><strong>9</strong><em>3 departments</em></article></div>
                <section className="vf-home-preview-flow"><div><span>Recent arrivals</span><b>View all</b></div>{[["ML","Mai Le","VIP · Badge 0842"],["TN","Tuan Nguyen","General · Badge 0843"],["AS","Ari Santos","Vendor · Hall B"]].map(([initial,name,detail]) => <article key={name}><i>{initial}</i><span><strong>{name}</strong><small>{detail}</small></span><BadgeCheck size={17} /></article>)}</section>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="vf-home-proof" aria-label="Platform coverage"><span><TicketCheck />Registration</span><span><Hotel />Hotel blocks</span><span><Store />Commerce</span><span><Users />Staff and vendors</span><span><ScanLine />Check-in</span></section>

      <section className="vf-home-section">
        <div className="vf-home-section-heading"><p className="vf-label">One source of truth</p><h2>The messy middle is where vFurst earns its keep.</h2><p>Every workflow shares attendee, inventory, payment, and staffing context—so the team can act without translating between systems.</p></div>
        <div className="vf-home-capability-grid">{capabilities.map(({ icon: Icon, title, body }) => <article key={title}><span><Icon size={20} /></span><h3>{title}</h3><p>{body}</p></article>)}</div>
      </section>

      <section className="vf-home-workflow-section">
        <div className="vf-home-section-heading"><p className="vf-label">From setup to show floor</p><h2>A workspace that changes with the event.</h2></div>
        <div className="vf-home-workflow">{workflow.map((item) => <article key={item.number}><span>{item.number}</span><div><h3>{item.title}</h3><p>{item.body}</p></div></article>)}</div>
      </section>

      <section className="vf-home-cta"><div><p className="vf-label">Managed onboarding</p><h2>Replace the spreadsheet maze before launch week.</h2><p>We provision your organization, invite its first owner, and help connect the public domain before your team configures events.</p></div><Link className="vf-home-button vf-home-button-primary" href="/request-access">Talk to the platform team <ArrowRight size={17} /></Link></section>
      <MarketingFooter />
    </main>
  );
}
