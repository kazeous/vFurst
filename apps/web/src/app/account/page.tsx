import { AccountStatus } from "@/components/account/account-status";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/dashboard/stat-card";
import { formatCurrency } from "@/lib/registration/pricing";
import { requirePublicAccount } from "@/lib/public-account";
import { prisma } from "@vfurst/db";
import { normalizeTransferEmail } from "@/lib/registration-transfer";

export default async function AccountOverviewPage() {
  const user = await requirePublicAccount("/account");
  const [registrationCount, orderCount, hotelCount, volunteerCount, vendorCount, transferCount, registrations, orders] = await Promise.all([
    prisma.registration.count({ where: { userId: user.id } }),
    prisma.order.count({ where: { userId: user.id } }),
    prisma.hotelBooking.count({ where: { userId: user.id } }),
    prisma.volunteerApplication.count({ where: { userId: user.id } }),
    prisma.vendorApplication.count({ where: { userId: user.id } }),
    prisma.registrationTransferRequest.count({
      where: {
        recipientEmail: normalizeTransferEmail(user.email),
        status: "PENDING",
        expiresAt: { gt: new Date() }
      }
    }),
    prisma.registration.findMany({
      where: { userId: user.id },
      include: { event: true, org: true, type: true },
      orderBy: { createdAt: "desc" },
      take: 3
    }),
    prisma.order.findMany({
      where: { userId: user.id },
      include: { event: true, org: true },
      orderBy: { createdAt: "desc" },
      take: 3
    })
  ]);

  return (
    <div className="vf-stack">
      <section className="vf-stat-grid">
        <StatCard label="Registrations" value={registrationCount.toString()} detail="Tickets across events" progress={registrationCount ? 100 : 10} />
        <StatCard label="Orders" value={orderCount.toString()} detail="Payments and purchases" progress={orderCount ? 100 : 10} />
        <StatCard label="Hotel stays" value={hotelCount.toString()} detail="Room-block bookings" progress={hotelCount ? 100 : 10} />
        <StatCard label="Applications" value={(volunteerCount + vendorCount).toString()} detail="Volunteer and vendor" progress={volunteerCount + vendorCount ? 100 : 10} />
        <StatCard label="Transfers" value={transferCount.toString()} detail="Pending invitations" progress={transferCount ? 100 : 10} />
      </section>

      <section className="vf-two-column">
        <div className="vf-section">
          <div className="vf-page-header"><h2>Recent registrations</h2><Button label="View all" href="/account/registrations" size="sm" /></div>
          <div className="vf-list">
            {registrations.map((registration) => (
              <div key={registration.id} className="vf-list-row">
                <span><strong>{registration.event.name}</strong><small>{registration.org.name} · {registration.type.name}</small></span>
                <span className="vf-inline-status"><AccountStatus status={registration.status} />{registration.approvalStatus === "PENDING" ? <small>Awaiting approval</small> : null}</span>
              </div>
            ))}
            {registrations.length === 0 ? <p className="vf-empty">No registrations yet.</p> : null}
          </div>
        </div>
        <div className="vf-section">
          <div className="vf-page-header"><h2>Recent orders</h2><Button label="View all" href="/account/orders" size="sm" /></div>
          <div className="vf-list">
            {orders.map((order) => (
              <div key={order.id} className="vf-list-row">
                <span><strong>{order.event.name}</strong><small>{order.org.name} · {formatCurrency(order.total, order.currency)}</small></span>
                <AccountStatus status={order.status} />
              </div>
            ))}
            {orders.length === 0 ? <p className="vf-empty">No orders yet.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
