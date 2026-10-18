import { AccountStatus } from "@/components/account/account-status";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/i18n";
import { requirePortalPageContext } from "@/lib/portal-context";
import { prisma } from "@vfurst/db";

export default async function AccountHotelPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const context = await requirePortalPageContext(orgSlug, "/account/hotel");
  const bookings = await prisma.hotelBooking.findMany({
    where: { orgId: context.org.id, portalAccountId: context.account.id },
    include: { block: { include: { event: true, org: true } } },
    orderBy: { createdAt: "desc" }
  });

  return (
    <section className="vf-stack">
      <div><p className="vf-label">Travel</p><h2>My hotel bookings</h2><p className="vf-muted">Room-block reservations owned by this account.</p></div>
      {bookings.map((booking) => (
        <article key={booking.id} className="vf-section">
          <div className="vf-page-header">
            <div><p className="vf-label">{booking.block.org.name}</p><h3>{booking.block.hotelName}</h3><p className="vf-muted">{booking.block.event.name} · {booking.roomType} · {formatDate(booking.checkIn)}–{formatDate(booking.checkOut)}</p></div>
            <AccountStatus status={booking.confirmationCode === "PENDING" ? "PENDING" : "CONFIRMED"} />
          </div>
          <p>Confirmation: <strong>{booking.confirmationCode ?? "Pending"}</strong></p>
          <Button label="Event hotel page" href="/hotel" size="sm" />
        </article>
      ))}
      {bookings.length === 0 ? <p className="vf-empty">No hotel bookings are linked to this account.</p> : null}
    </section>
  );
}
