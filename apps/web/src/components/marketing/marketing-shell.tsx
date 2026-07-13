import Link from "next/link";
import type { ReactNode } from "react";

type MarketingShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
};

export function MarketingNav() {
  return (
    <nav className="vf-marketing-nav" aria-label="Marketing navigation">
      <Link className="vf-marketing-brand" href="/">
        <span className="vf-marketing-brand-mark">vF</span>
        <span>vFurst</span>
      </Link>
      <div className="vf-marketing-nav-links">
        <Link href="/features">Features</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/docs">Docs</Link>
        <Link href="/login">Log in</Link>
        <Link className="vf-marketing-cta" href="/register">
          Start organizing
        </Link>
      </div>
    </nav>
  );
}

export function MarketingFooter() {
  return (
    <footer className="vf-marketing-footer">
      <div><Link className="vf-marketing-brand" href="/"><span className="vf-marketing-brand-mark">vF</span><span>vFurst</span></Link><p>Convention operations, minus the chaos.</p></div>
      <div><strong>Product</strong><Link href="/features">Features</Link><Link href="/pricing">Pricing</Link><Link href="/docs">Documentation</Link></div>
      <div><strong>Legal</strong><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/dmca">DMCA</Link></div>
      <small>© {new Date().getFullYear()} vFurst. Built for the people running the room.</small>
    </footer>
  );
}

export function MarketingShell({ children, eyebrow, title, description }: MarketingShellProps) {
  return (
    <main className="vf-marketing-page">
      <MarketingNav />
      {title ? (
        <header className="vf-marketing-page-header">
          {eyebrow ? <p className="vf-label">{eyebrow}</p> : null}
          <h1>{title}</h1>
          {description ? <p>{description}</p> : null}
        </header>
      ) : null}
      {children}
      <MarketingFooter />
    </main>
  );
}
