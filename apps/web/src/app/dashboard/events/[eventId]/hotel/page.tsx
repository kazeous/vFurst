import { cancelBooking, createHotelBlock, updateHotelBlock } from "@/actions/hotel-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { formatCurrency, formatMoneyInput, parseRoomTypes } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export default async function HotelManagementPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      org: true,
      hotelBlocks: {
        include: {
          bookings: {
            include: {
              portalAccount: { select: { id: true, email: true, name: true } }
            },
            orderBy: {
              createdAt: "desc"
            }
          }
        },
        orderBy: {
          cutoffDate: "asc"
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Hotel</p>
          <h1>Hotel blocks</h1>
        </div>
        <Button label="Public hotel page" href={`/${event.org.subdomain}/hotel`} />
      </header>
      <section className="vf-two-column">
        <div className="vf-section">
          <h2>Create hotel block</h2>
          <ActionStateForm action={createHotelBlock} className="vf-form" errorTestId="create-hotel-block-error">
            <input type="hidden" name="eventId" value={event.id} />
            <label>
              Hotel name
              <input name="hotelName" required placeholder="Convention Grand" />
            </label>
            <label>
              Cutoff date
              <input name="cutoffDate" type="date" required />
            </label>
            {[0, 1, 2].map((index) => (
              <div key={index} className="vf-subform-row">
                <label>
                  Room type
                  <input name="roomName" placeholder={index === 0 ? "Double" : "Suite"} required={index === 0} />
                </label>
                <label>
                  Nightly rate
                  <input name="roomRate" type="number" min="0" step={event.currency === "VND" ? "1" : "0.01"} required={index === 0} />
                </label>
                <label>
                  Rooms
                  <input name="roomTotal" type="number" min="1" required={index === 0} />
                </label>
              </div>
            ))}
            <Button label="Create block" type="submit" variant="primary" />
          </ActionStateForm>
        </div>
        <div className="vf-section">
          <h2>Summary</h2>
          <div className="vf-list">
            {event.hotelBlocks.map((block) => {
              const totalRooms = parseRoomTypes(block.roomTypes).reduce((sum, room) => sum + room.totalRooms, 0);

              return (
                <div key={block.id} className="vf-list-row">
                  <span>{block.hotelName}</span>
                  <small>
                    {block.bookings.length} / {totalRooms} booked
                  </small>
                </div>
              );
            })}
            {event.hotelBlocks.length === 0 ? <p className="vf-empty">No hotel blocks yet.</p> : null}
          </div>
        </div>
      </section>
      <section className="vf-stack">
        {event.hotelBlocks.map((block) => {
          const roomTypes = parseRoomTypes(block.roomTypes);

          return (
            <div key={block.id} className="vf-section">
              <h2>{block.hotelName}</h2>
              <ActionStateForm action={updateHotelBlock} className="vf-form">
                <input type="hidden" name="blockId" value={block.id} />
                <div className="vf-subform-row">
                  <label>
                    Hotel name
                    <input name="hotelName" defaultValue={block.hotelName} required />
                  </label>
                  <label>
                    Cutoff date
                    <input name="cutoffDate" type="date" defaultValue={block.cutoffDate.toISOString().slice(0, 10)} required />
                  </label>
                </div>
                {roomTypes.map((room) => {
                  const booked = block.bookings.filter((booking) => booking.roomType === room.name).length;

                  return (
                    <div key={room.name} className="vf-subform-row">
                      <label>
                        Room type
                        <input name="roomName" defaultValue={room.name} required />
                      </label>
                      <label>
                        Nightly rate
                        <input
                          name="roomRate"
                          type="number"
                          min="0"
                          step={event.currency === "VND" ? "1" : "0.01"}
                          defaultValue={formatMoneyInput(room.rate, event.currency)}
                          required
                        />
                      </label>
                      <label>
                        Rooms
                        <input name="roomTotal" type="number" min="1" defaultValue={room.totalRooms} required />
                      </label>
                      <p className="vf-muted">{booked} booked</p>
                    </div>
                  );
                })}
                <Button label="Save block" type="submit" />
              </ActionStateForm>
              <h3>Bookings</h3>
              <div className="vf-list">
                {block.bookings.map((booking) => (
                  <div key={booking.id} className="vf-list-row">
                    <span>
                      {booking.portalAccount.name ?? booking.portalAccount.email} - {booking.roomType}
                    </span>
                    <small>
                      {booking.checkIn.toLocaleDateString()} to {booking.checkOut.toLocaleDateString()} - {booking.confirmationCode ?? "Pending"}
                    </small>
                    <form action={cancelBooking}>
                      <input type="hidden" name="bookingId" value={booking.id} />
                      <Button label="Cancel" type="submit" size="sm" variant="destructive" />
                    </form>
                  </div>
                ))}
                {block.bookings.length === 0 ? <p className="vf-empty">No bookings yet.</p> : null}
              </div>
              <h3>Room status</h3>
              <div className="vf-stat-grid">
                {roomTypes.map((room) => {
                  const booked = block.bookings.filter((booking) => booking.roomType === room.name).length;

                  return (
                    <div key={room.name} className="vf-stat-card">
                      <p className="vf-label">{room.name}</p>
                      <strong>
                        {booked} / {room.totalRooms}
                      </strong>
                      <span>{formatCurrency(room.rate, event.currency)} per night</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
