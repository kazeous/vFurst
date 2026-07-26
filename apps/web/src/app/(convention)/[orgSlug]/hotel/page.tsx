import { HotelBookingForm } from "./booking-form";
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
              <HotelBookingForm
                key={block.id}
                eventId={event.id}
                blockId={block.id}
                hotelName={block.hotelName}
                cutoffLabel={block.cutoffDate.toLocaleDateString()}
                roomTypes={roomTypes.map((roomType) => {
                  const booked = block.bookings.filter((booking) => booking.roomType === roomType.name).length;

                  return {
                    name: roomType.name,
                    label: `${roomType.name} - ${formatCurrency(roomType.rate, event.currency)} / night - ${roomType.totalRooms - booked} left`,
                    soldOut: booked >= roomType.totalRooms
                  };
                })}
                defaultGuestName={session.user.name ?? ""}
                guestEmail={session.user.email ?? ""}
              />
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
