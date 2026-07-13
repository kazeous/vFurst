import { BadgeCheck, ScanLine, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="vf-auth-layout">
      <section className="vf-auth-story" aria-label="About vFurst">
        <Link className="vf-auth-brand" href="/"><span>vF</span>vFurst</Link>
        <div><p className="vf-label">Convention operations platform</p><h2>Keep the whole team pointed at the same event.</h2><p>Registration, people, commerce, badges, check-in, and reporting share one calm workspace.</p><ul><li><BadgeCheck />Connected attendee records</li><li><Users />Staff and vendor coordination</li><li><ScanLine />Launch-day check-in tools</li></ul></div>
        <small>Built for the people running the room.</small>
      </section>
      <section className="vf-auth-content">{children}<Link className="vf-auth-back" href="/">← Back to vFurst</Link></section>
    </main>
  );
}
