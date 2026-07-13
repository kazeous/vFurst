import { DocsNav } from "@/components/docs/docs-nav";
import Link from "next/link";
import type { ReactNode } from "react";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="vf-docs-layout">
      <header className="vf-docs-topbar"><Link href="/" className="vf-app-logo"><span className="vf-app-logo-mark">vF</span><span>vFurst</span></Link><span>Documentation</span><Link href="/dashboard">Dashboard →</Link></header>
      <aside className="vf-docs-sidebar"><p className="vf-label">Guides and reference</p><DocsNav /><div><strong>Need an API key?</strong><p>Create one from organization settings in the organizer console.</p></div></aside>
      <div className="vf-docs-content">{children}</div>
    </div>
  );
}
