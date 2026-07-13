import { Alert } from "@/components/ui/alert";
import { RegistrationFlow } from "@/app/(convention)/[orgSlug]/register/registration-flow";
import { getScheduledPrice } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { unstable_cache, unstable_noStore as noStore } from "next/cache";
import { notFound } from "next/navigation";

export const revalidate = 15;

const getPublicRegistrationData = unstable_cache(
  async (orgSlug: string) => {
    const org = await prisma.organization.findFirst({
      where: { OR: [{ subdomain: orgSlug }, { slug: orgSlug }, { customDomain: orgSlug.toLowerCase() }] },
      select: { id: true, name: true, subdomain: true }
    });
    if (!org) return null;
    const event = await prisma.event.findFirst({
      where: { orgId: org.id, status: "PUBLISHED" },
      orderBy: { startDate: "asc" },
      select: {
        id: true, description: true, currency: true, name: true,
        registrationTypes: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true, maxCapacity: true, name: true, price: true, scheduledPricing: true,
            addOns: { orderBy: { sortOrder: "asc" } },
            _count: { select: { registrations: { where: { status: { not: "CANCELLED" } } } } }
          }
        }
      }
    });
    return { event, org };
  },
  ["public-registration-page-v2"],
  { revalidate: 15 }
);

export default async function PublicRegistrationPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ success?: string; cancelled?: string }> }) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  if (query.success || query.cancelled) noStore();
  const data = await getPublicRegistrationData(orgSlug);
  if (!data) notFound();
  const { event, org } = data;
  const successRegistration = query.success
    ? await prisma.registration.findFirst({
        where: {
          id: query.success,
          orgId: org.id
        },
        include: { event: true, type: true, user: true }
      })
    : null;

  return (
    <main className="vf-public-page vf-registration-flow-page">
      <header className="vf-public-header"><div><p className="vf-label">{org.name}</p><h1>Registration</h1><p className="vf-muted">Choose a ticket, add attendee details, and review before payment.</p></div></header>
      {successRegistration ? <Alert variant="success"><h2>Registration confirmed</h2><p>{successRegistration.user.name ?? successRegistration.user.email} is registered for {successRegistration.event.name} as {successRegistration.type.name}.</p></Alert> : null}
      {query.cancelled ? <Alert variant="warning"><h2>Checkout cancelled</h2><p>No payment was captured. Your ticket selection is still available to start again.</p></Alert> : null}
      {!event ? <section className="vf-section"><h2>Registration is not open yet</h2><p className="vf-muted">This organizer has not published an event.</p></section> : (
        <RegistrationFlow
          eventId={event.id}
          currency={event.currency}
          tiers={event.registrationTypes.map((type) => ({
            id: type.id,
            name: type.name,
            currentPrice: getScheduledPrice(type.price, type.scheduledPricing),
            soldOut: type.maxCapacity != null && type._count.registrations >= type.maxCapacity,
            remaining: type.maxCapacity == null ? undefined : Math.max(type.maxCapacity - type._count.registrations, 0),
            addOns: type.addOns.map((addOn) => ({ id: addOn.id, name: addOn.name, price: addOn.price, isComplimentary: addOn.isComplimentary, maxQuantity: addOn.maxQuantity }))
          }))}
        />
      )}
    </main>
  );
}
