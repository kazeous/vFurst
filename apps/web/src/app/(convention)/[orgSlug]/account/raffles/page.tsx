import { requirePortalPageContext } from "@/lib/portal-context";
import { getCoreRegistrationEligibilityDescription, parseRaffleEligibility } from "@/lib/raffle-policy";
import { prisma } from "@vfurst/db";

export default async function AccountRafflesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const context = await requirePortalPageContext(orgSlug, "/account/raffles");
  const [entries, wins] = await Promise.all([
    prisma.raffleEntry.findMany({
      where: { orgId: context.org.id, portalAccountId: context.account.id },
      include: { raffle: { include: { event: true, org: true } } },
      orderBy: { createdAt: "desc" }
    }),
    prisma.raffleDrawResult.findMany({
      where: { orgId: context.org.id, winnerAccountId: context.account.id },
      include: { raffle: { include: { event: true, org: true } } },
      orderBy: { drawnAt: "desc" }
    })
  ]);

  return (
    <section className="vf-stack">
      <div>
        <p className="vf-label">Attendee raffle status</p>
        <h2>My raffle entries</h2>
        <p className="vf-muted">Only your own entry quantities and winning results are shown.</p>
      </div>
      <section className="vf-section">
        <h3>Entries</h3>
        <div className="vf-list">
          {entries.map((entry) => {
            let eligibility: string;
            try {
              eligibility = getCoreRegistrationEligibilityDescription(parseRaffleEligibility(entry.raffle.eligibility));
            } catch {
              eligibility = "Eligibility configuration unavailable";
            }
            return (
              <div key={entry.id} className="vf-list-row">
                <span><strong>{entry.raffle.name}</strong><small>{entry.raffle.org.name} · {entry.raffle.event.name}</small></span>
                <small>{entry.quantity} weighted entr{entry.quantity === 1 ? "y" : "ies"} · {entry.entryMethod} · {eligibility}</small>
              </div>
            );
          })}
          {entries.length === 0 ? <p className="vf-empty">No raffle entries are linked to this account.</p> : null}
        </div>
      </section>
      <section className="vf-section">
        <h3>Winning results</h3>
        <div className="vf-list">
          {wins.map((win) => (
            <div key={win.id} className="vf-list-row">
              <span><strong>{win.prizeName}</strong><small>{win.raffle.name} · {win.raffle.event.name}</small></span>
              <small>Award {win.awardNumber} · {win.drawnAt.toLocaleString()} · {win.notifiedAt ? "Notified" : "Notification pending"}</small>
            </div>
          ))}
          {wins.length === 0 ? <p className="vf-empty">No winning results yet.</p> : null}
        </div>
      </section>
    </section>
  );
}
