import { addRaffleEntry, autoEnterConfirmedRegistrations, createRaffle, drawRaffleWinner } from "@/actions/phase5-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { StatCard } from "@/components/dashboard/stat-card";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";
import { getCoreRegistrationEligibilityDescription, parseRaffleEligibility } from "@/lib/raffle-policy";

export const dynamic = "force-dynamic";

function prizes(value: unknown) {
  return Array.isArray(value) ? (value as Array<{ name?: string; quantity?: number; description?: string }>) : [];
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
              portalAccount: true
            }
          }
        },
        orderBy: {
          drawDate: "asc"
        }
      },
      raffleDrawResults: {
        include: { raffle: true, winner: true },
        orderBy: { drawnAt: "desc" }
      },
      registrationTypes: {
        include: { addOns: true },
        orderBy: { sortOrder: "asc" }
      },
      storeProducts: { where: { archivedAt: null }, orderBy: { name: "asc" } },
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

  const winnerHistory = event.raffleDrawResults;
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
        <StatCard label="Winners" value={winnerHistory.length.toString()} detail="Durable draw results" progress={winnerHistory.length ? 100 : 10} />
      </section>

      <section className="vf-two-column">
        <form action={createRaffle} className="vf-section vf-form">
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
          <label>
            Eligibility
            <select name="eligibilityKind" defaultValue="CONFIRMED_REGISTRATION">
              <option value="CONFIRMED_REGISTRATION">Approved confirmed registration</option>
              <option value="CHECKED_IN">Approved checked-in registration</option>
              <option value="REGISTRATION_TIER">Specific registration tier</option>
              <option value="REGISTRATION_ADD_ON">Registration with add-on</option>
              <option value="PURCHASED">Paid product purchase</option>
            </select>
          </label>
          <label>
            Registration tier (for tier eligibility)
            <select name="eligibilityTypeId" defaultValue="">
              <option value="">Select a tier</option>
              {event.registrationTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </label>
          <label>
            Registration add-on (for add-on eligibility)
            <select name="eligibilityAddOnDefinitionId" defaultValue="">
              <option value="">Select an add-on</option>
              {event.registrationTypes.flatMap((type) => type.addOns).map((addOn) => (
                <option key={addOn.id} value={addOn.id}>{addOn.name}</option>
              ))}
            </select>
          </label>
          <label>
            Product (for purchase eligibility)
            <select name="eligibilityProductId" defaultValue="">
              <option value="">Select a product</option>
              {event.storeProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <label>
            Maximum entries per attendee
            <input type="number" name="maxEntriesPerUser" min={1} max={100} defaultValue={1} required />
          </label>
          <label>
            Entries per purchased unit
            <input type="number" name="entriesPerUnit" min={1} max={100} defaultValue={1} required />
          </label>
          <Button label="Create raffle" type="submit" variant="primary" />
        </form>

        <section className="vf-section">
          <h2>Winner history</h2>
          <div className="vf-list">
            {winnerHistory.map((item) => (
              <div key={item.id} className="vf-list-row">
                <span>{item.prizeName} (award {item.awardNumber})</span>
                <small>
                  {item.winner.name ?? item.winner.email} - {item.raffle.name} - {item.drawnAt.toLocaleString()}
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
                <p className="vf-muted">
                  Eligibility: {(() => { try { return getCoreRegistrationEligibilityDescription(parseRaffleEligibility(raffle.eligibility)); } catch { return "Invalid configuration"; } })()} · max {raffle.maxEntriesPerUser} per attendee
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
                  <input type="hidden" name="raffleId" value={raffle.id} />
                  <Button label="Auto-enter attendees" type="submit" />
                </form>
                <form action={addRaffleEntry} className="vf-form">
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
                <ActionStateForm action={drawRaffleWinner} className="vf-inline-form" errorTestId="raffle-draw-error">
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
                </ActionStateForm>
              </article>
            );
          })}
          {event.raffles.length === 0 ? <p className="vf-empty">Create the first raffle to start collecting entries.</p> : null}
        </div>
      </section>
    </div>
  );
}
