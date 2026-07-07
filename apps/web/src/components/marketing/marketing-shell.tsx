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
        vFurst
      </Link>
      <div>
        <Link href="/features">Features</Link>
        <Link href="/pricing">Pricing</Link>
        <Link href="/docs">Docs</Link>
        <Link href="/login">Log in</Link>
        <Link className="vf-marketing-cta" href="/register">
          Start
        </Link>
      </div>
    </nav>
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
    </main>
  );
}
