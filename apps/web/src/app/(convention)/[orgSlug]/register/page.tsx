import { getRegistrationForm } from "@/lib/registration-form";
import { getCurrentPolicySummaries } from "@/lib/policy-documents";
import { PUBLIC_REGISTRATION_CACHE_TAG, registrationFormFingerprint } from "@/lib/public-registration";
import { RegistrationFlow } from "@/app/(convention)/[orgSlug]/register/registration-flow";
import { RegistrationOutcome } from "@/app/(convention)/[orgSlug]/register/registration-outcome";
import { PortalAccountGate } from "@/components/account/portal-account-gate";
import { portalLoginPath, portalSignupPath } from "@/lib/portal-paths";
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
        id: true, description: true, currency: true, name: true, registrationForm: true,
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
    const policies = event ? await getCurrentPolicySummaries(prisma, { orgId: org.id, eventId: event.id }) : [];
    return { event, org, policies };
  },
  ["public-registration-page-v4"],
  { revalidate: 15, tags: [PUBLIC_REGISTRATION_CACHE_TAG] }
);

export default async function PublicRegistrationPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const data = await getPublicRegistrationData(orgSlug);
  if (!data) notFound();
  const { event, org, policies } = data;
  const form = getRegistrationForm(event?.registrationForm ?? {});
  const registration = !event ? <section className="vf-section"><h2>Registration is not open yet</h2><p className="vf-muted">This organizer has not published an event.</p></section> : (
    <PortalAccountGate loginHref={portalLoginPath("/register")} signupHref={portalSignupPath("/register")} sessionUrl={`/api/portal/attendees?eventId=${encodeURIComponent(event.id)}`}>
      <RegistrationFlow
        form={form}
        formVersion={registrationFormFingerprint(form)}
        policies={policies}
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
    </PortalAccountGate>
  );

  // The page stays static: the outcome reads the query on the client, and the
  // prerendered HTML keeps the registration body as the Suspense fallback.
  return (
    <main className="vf-public-page vf-registration-flow-page">
      <header className="vf-public-header"><div><p className="vf-label">{org.name}</p><h1>Registration</h1><p className="vf-muted">Choose a ticket, add attendee details, and review before payment.</p></div><Button label="Account" href="/account" /></header>
      <Suspense fallback={registration}>
        <RegistrationOutcome orgSlug={orgSlug}>{registration}</RegistrationOutcome>
      </Suspense>
    </main>
  );
}
