import { AccountStatus } from "@/components/account/account-status";
import { Button } from "@/components/ui/button";
import { requirePublicAccount } from "@/lib/public-account";
import { prisma } from "@vfurst/db";

export default async function AccountHotelPage() {
  const user = await requirePublicAccount("/account/hotel");
  const bookings = await prisma.hotelBooking.findMany({
    where: { userId: user.id },
    include: { block: { include: { event: true, org: true } } },
    orderBy: { createdAt: "desc" }
  });

  return (
    <section className="vf-stack">
      <div><p className="vf-label">Travel</p><h2>My hotel bookings</h2><p className="vf-muted">Room-block reservations owned by this account.</p></div>
      {bookings.map((booking) => (
        <article key={booking.id} className="vf-section">
          <div className="vf-page-header">
            <div><p className="vf-label">{booking.block.org.name}</p><h3>{booking.block.hotelName}</h3><p className="vf-muted">{booking.block.event.name} · {booking.roomType} · {booking.checkIn.toLocaleDateString()}–{booking.checkOut.toLocaleDateString()}</p></div>
            <AccountStatus status={booking.confirmationCode === "PENDING" ? "PENDING" : "CONFIRMED"} />
          </div>
          <p>Confirmation: <strong>{booking.confirmationCode ?? "Pending"}</strong></p>
          <Button label="Event hotel page" href={`/${booking.block.org.subdomain}/hotel`} size="sm" />
        </article>
      ))}
      {bookings.length === 0 ? <p className="vf-empty">No hotel bookings are linked to this account.</p> : null}
    </section>
  );
}
