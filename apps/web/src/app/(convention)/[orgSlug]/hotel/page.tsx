import { bookRoom } from "@/actions/hotel-actions";
import { getCentralAppUrl, getCentralLoginUrl, getCentralPortalPath, getCentralRegistrationUrl } from "@/lib/central-url";
import { getConventionOrg, getConventionPortalRootForRequest } from "@/lib/convention";
import { auth } from "@/lib/auth";
import { formatCurrency, parseRoomTypes } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PublicHotelPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ success?: string; cancelled?: string }>;
}) {
  const [{ orgSlug }, query, session] = await Promise.all([params, searchParams, auth()]);
  const org = await getConventionOrg(orgSlug);

  if (!org) {
    notFound();
  }
  const portalRoot = await getConventionPortalRootForRequest(org);
  const centralPath = getCentralPortalPath(org.subdomain, "/hotel");
  const loginHref = getCentralLoginUrl(centralPath);
  const registerHref = getCentralRegistrationUrl(centralPath);

  const event = await prisma.event.findFirst({
    where: {
      orgId: org.id,
      status: "PUBLISHED"
    },
    orderBy: {
      startDate: "asc"
    },
    include: {
      hotelBlocks: {
        include: {
          bookings: true
        },
        orderBy: {
          cutoffDate: "asc"
        }
      }
    }
  });

  const successBooking =
    query.success && session?.user?.id
      ? await prisma.hotelBooking.findFirst({
          where: {
            id: query.success,
            userId: session.user.id,
            block: {
              event: {
                orgId: org.id
              }
            }
          },
          include: {
            block: true,
            user: true
          }
        })
      : null;

  return (
    <main className="vf-public-page">
      <header className="vf-public-header">
        <div>
          <p className="vf-label">{org.name}</p>
          <h1>Hotel</h1>
        </div>
        <div className="vf-actions">
          <Button label="Register" href={`${portalRoot}/register`} />
          <Button label="Store" href={`${portalRoot}/store`} />
          <Button label="Volunteer" href={`${portalRoot}/volunteer`} />
          <Button label="Vendor apply" href={`${portalRoot}/vendor-apply`} />
          <Button label="Account" href={getCentralAppUrl("/account")} />
        </div>
      </header>

      {!session?.user?.id ? (
        <section className="vf-section">
          <p className="vf-label">Public account required</p>
          <h2>Sign in before booking a room</h2>
          <p className="vf-muted">Your reservation and confirmation will be saved to your central vFurst account.</p>
          <div className="vf-actions"><Button label="Log in" href={loginHref} variant="primary" /><Button label="Create account" href={registerHref} /></div>
        </section>
      ) : null}

      {successBooking ? (
        <section className="vf-section">
          <h2>Hotel booking confirmed</h2>
          <p>
            {successBooking.user.name ?? successBooking.user.email} booked {successBooking.roomType} at{" "}
            {successBooking.block.hotelName}.
          </p>
        </section>
      ) : null}

      {query.cancelled ? (
        <section className="vf-section">
          <h2>Checkout cancelled</h2>
          <p className="vf-muted">No payment was captured. You can restart booking below.</p>
        </section>
      ) : null}

      {!event ? (
        <section className="vf-section">
          <h2>No published event</h2>
          <p className="vf-muted">Hotel booking opens after the organizer publishes an event.</p>
        </section>
      ) : (
        <div className="vf-stack">
          {event.hotelBlocks.map((block) => {
            const roomTypes = parseRoomTypes(block.roomTypes);

            return session?.user?.id ? (
              <form key={block.id} action={bookRoom} className="vf-section">
                <input type="hidden" name="eventId" value={event.id} />
                <input type="hidden" name="blockId" value={block.id} />
                <div>
                  <p className="vf-label">Cutoff {block.cutoffDate.toLocaleDateString()}</p>
                  <h2>{block.hotelName}</h2>
                </div>
                <label>
                  Room type
                  <select name="roomType" required>
                    {roomTypes.map((roomType) => {
                      const booked = block.bookings.filter((booking) => booking.roomType === roomType.name).length;

                      return (
                        <option key={roomType.name} value={roomType.name} disabled={booked >= roomType.totalRooms}>
                          {roomType.name} - {formatCurrency(roomType.rate, event.currency)} / night - {roomType.totalRooms - booked} left
                        </option>
                      );
                    })}
                  </select>
                </label>
                <div className="vf-form-grid">
                  <label>
                    Check-in
                    <input name="checkIn" type="date" required />
                  </label>
                  <label>
                    Check-out
                    <input name="checkOut" type="date" required />
                  </label>
                </div>
                <div className="vf-form-grid">
                  <label>
                    Guest name
                    <input name="guestName" defaultValue={session.user.name ?? ""} required />
                  </label>
                  <label>
                    Guest email
                    <input name="guestEmail" type="email" defaultValue={session.user.email ?? ""} readOnly required />
                  </label>
                </div>
                <Button label="Continue to checkout" type="submit" variant="primary" />
              </form>
            ) : null;
          })}
          {event.hotelBlocks.length === 0 ? (
            <section className="vf-section">
              <h2>No hotel blocks</h2>
              <p className="vf-muted">Hotel inventory has not been published yet.</p>
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}
