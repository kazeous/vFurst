import { RegistrationFlow } from "@/app/(convention)/[orgSlug]/register/registration-flow";
import { RegistrationStatusAlert } from "@/app/(convention)/[orgSlug]/register/registration-status-alert";
import { PublicAccountGate } from "@/components/account/public-account-gate";
import { getCentralAppUrl, getCentralLoginUrl, getCentralPortalPath, getCentralRegistrationUrl } from "@/lib/central-url";
import { getScheduledPrice } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense } from "react";

export const revalidate = 15;

export function generateStaticParams() {
  return [];
}

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
            _count: { select: { registrations: { where: { status: { in: ["PENDING", "CONFIRMED", "CHECKED_IN"] } } } } }
          }
        }
      }
    });
    return { event, org };
  },
  ["public-registration-page-v2"],
  { revalidate: 15 }
);

export default async function PublicRegistrationPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const data = await getPublicRegistrationData(orgSlug);
  if (!data) notFound();
  const { event, org } = data;
  const centralPath = getCentralPortalPath(org.subdomain, "/register");

  return (
    <main className="vf-public-page vf-registration-flow-page">
      <header className="vf-public-header"><div><p className="vf-label">{org.name}</p><h1>Registration</h1><p className="vf-muted">Choose a ticket, add attendee details, and review before payment.</p></div><Button label="Account" href={getCentralAppUrl("/account")} /></header>
      <Suspense fallback={null}>
        <RegistrationStatusAlert orgSlug={orgSlug} />
      </Suspense>
      {!event ? <section className="vf-section"><h2>Registration is not open yet</h2><p className="vf-muted">This organizer has not published an event.</p></section> : (
        <PublicAccountGate loginHref={getCentralLoginUrl(centralPath)} registerHref={getCentralRegistrationUrl(centralPath)}>
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
        </PublicAccountGate>
      )}
    </main>
  );
}
