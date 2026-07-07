import { MarketingShell } from "@/components/marketing/marketing-shell";

export const metadata = {
  title: "DMCA Policy | vFurst",
  description: "DMCA takedown policy for vFurst."
};

export default function DmcaPage() {
  return (
    <MarketingShell eyebrow="Legal" title="DMCA Takedown Policy" description="How copyright owners can report allegedly infringing event content.">
      <article className="vf-legal-document">
        <p>Effective date: July 7, 2026</p>
        <h2>Submitting a notice</h2>
        <p>
          Copyright owners may submit a takedown notice identifying the copyrighted work, the allegedly infringing material, the event or
          URL where it appears, contact information, a good-faith statement, and a statement under penalty of perjury that the notice is
          accurate and authorized.
        </p>
        <h2>Counter notices</h2>
        <p>
          If content is removed and the organizer believes the removal was a mistake, the organizer may submit a counter notice with contact
          information, identification of the removed content, consent to jurisdiction where required, and a statement under penalty of
          perjury that the material was removed by mistake or misidentification.
        </p>
        <h2>Repeat infringement</h2>
        <p>vFurst may suspend or terminate accounts that repeatedly host infringing content.</p>
        <h2>Contact</h2>
        <p>DMCA notices can be sent to dmca@vfurst.app.</p>
      </article>
    </MarketingShell>
  );
}
