import { addRaffleEntry, autoEnterConfirmedRegistrations, createRaffle, drawRaffleWinner } from "@/actions/phase5-actions";
import { StatCard } from "@/components/dashboard/stat-card";
import { prisma } from "@vfurst/db";
import { Button } from "@astryxdesign/core/Button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type RaffleHistoryItem = {
  raffleId: string;
  raffleName: string;
  prizeName: string;
  winnerName: string;
  winnerEmail: string;
  drawnAt: string;
};

function prizes(value: unknown) {
  return Array.isArray(value) ? (value as Array<{ name?: string; quantity?: number; description?: string }>) : [];
}

function history(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const settings = value as { raffleHistory?: unknown };
  return Array.isArray(settings.raffleHistory) ? (settings.raffleHistory as RaffleHistoryItem[]) : [];
}

export default async function RafflePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      raffles: {
        include: {
          entries: {
            include: {
              user: true
            }
          }
        },
        orderBy: {
          drawDate: "asc"
        }
      },
      registrations: {
        where: {
          status: {
            in: ["CONFIRMED", "CHECKED_IN"]
          }
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  const winnerHistory = history(event.settings);
  const totalEntries = event.raffles.reduce((sum, raffle) => sum + raffle.entries.length, 0);

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Advanced</p>
          <h1>Raffles</h1>
          <p className="vf-muted">Create raffles, populate entries, draw winners, and keep a winner history.</p>
        </div>
      </header>

      <section className="vf-stat-grid">
        <StatCard label="Raffles" value={event.raffles.length.toString()} detail="Configured drawings" progress={event.raffles.length ? 70 : 10} />
        <StatCard label="Eligible attendees" value={event.registrations.length.toString()} detail="Confirmed/check-in pool" progress={80} />
        <StatCard label="Entries" value={totalEntries.toString()} detail="Across all raffles" progress={totalEntries ? 75 : 10} />
        <StatCard label="Winners" value={winnerHistory.length.toString()} detail="Draw history" progress={winnerHistory.length ? 100 : 10} />
      </section>

      <section className="vf-two-column">
        <form action={createRaffle} className="vf-section vf-form">
          <input type="hidden" name="orgId" value={event.orgId} />
          <input type="hidden" name="eventId" value={event.id} />
          <h2>Create raffle</h2>
          <label>
            Name
            <input name="name" required />
          </label>
          <label>
            Draw date
            <input type="datetime-local" name="drawDate" required />
          </label>
          <label>
            Prizes
            <textarea name="prizes" rows={5} placeholder="VIP Pass|1|Free upgrade" required />
          </label>
          <Button label="Create raffle" type="submit" variant="primary" />
        </form>

        <section className="vf-section">
          <h2>Winner history</h2>
          <div className="vf-list">
            {winnerHistory.map((item, index) => (
              <div key={`${item.raffleId}-${item.drawnAt}-${index}`} className="vf-list-row">
                <span>{item.prizeName}</span>
                <small>
                  {item.winnerName} - {item.raffleName} - {new Date(item.drawnAt).toLocaleString()}
                </small>
              </div>
            ))}
            {winnerHistory.length === 0 ? <p className="vf-empty">Drawn winners will appear here.</p> : null}
          </div>
        </section>
      </section>

      <section className="vf-section">
        <h2>Drawings</h2>
        <div className="vf-schedule-grid">
          {event.raffles.map((raffle) => {
            const rafflePrizes = prizes(raffle.prizes);

            return (
              <article key={raffle.id} className="vf-schedule-role">
                <h3>{raffle.name}</h3>
                <p className="vf-muted">
                  {raffle.entries.length} entries - draw {raffle.drawDate.toLocaleString()}
                </p>
                <div className="vf-list">
                  {rafflePrizes.map((prize, index) => (
                    <div key={`${prize.name}-${index}`} className="vf-list-row">
                      <span>{prize.name}</span>
                      <small>
                        Qty {prize.quantity ?? 1}
                        {prize.description ? ` - ${prize.description}` : ""}
                      </small>
                    </div>
                  ))}
                </div>
                <form action={autoEnterConfirmedRegistrations}>
                  <input type="hidden" name="orgId" value={event.orgId} />
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="raffleId" value={raffle.id} />
                  <Button label="Auto-enter attendees" type="submit" />
                </form>
                <form action={addRaffleEntry} className="vf-form">
                  <input type="hidden" name="orgId" value={event.orgId} />
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="raffleId" value={raffle.id} />
                  <label>
                    Manual entry email
                    <input type="email" name="attendeeEmail" required />
                  </label>
                  <label>
                    Name
                    <input name="attendeeName" />
                  </label>
                  <Button label="Add entry" type="submit" />
                </form>
                <form action={drawRaffleWinner} className="vf-inline-form">
                  <input type="hidden" name="orgId" value={event.orgId} />
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="raffleId" value={raffle.id} />
                  <label>
                    Prize
                    <select name="prizeName">
                      {rafflePrizes.map((prize, index) => (
                        <option key={`${prize.name}-${index}`} value={prize.name ?? "Prize"}>
                          {prize.name ?? "Prize"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button label="Draw winner" type="submit" variant="primary" />
                </form>
              </article>
            );
          })}
          {event.raffles.length === 0 ? <p className="vf-empty">Create the first raffle to start collecting entries.</p> : null}
        </div>
      </section>
    </div>
  );
}
