import { createRegistration } from "@/actions/registration-actions";
import { getConventionOrg } from "@/lib/convention";
import { formatCurrency, getScheduledPrice } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@astryxdesign/core/Button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PublicRegistrationPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ success?: string; cancelled?: string }>;
}) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const org = await getConventionOrg(orgSlug);

  if (!org) {
    notFound();
  }

  const event = await prisma.event.findFirst({
    where: {
      orgId: org.id,
      status: "PUBLISHED"
    },
    orderBy: {
      startDate: "asc"
    },
    include: {
      registrationTypes: {
        orderBy: {
          sortOrder: "asc"
        },
        include: {
          addOns: {
            orderBy: {
              sortOrder: "asc"
            }
          },
          registrations: true
        }
      }
    }
  });

  const successRegistration = query.success
    ? await prisma.registration.findUnique({
        where: {
          id: query.success
        },
        include: {
          event: true,
          type: true,
          user: true
        }
      })
    : null;

  return (
    <main className="vf-public-page">
      <header className="vf-public-header">
        <div>
          <p className="vf-label">{org.name}</p>
          <h1>Register</h1>
        </div>
        <div className="vf-actions">
          <Button label="Hotel" href={`/${org.subdomain}/hotel`} />
          <Button label="Store" href={`/${org.subdomain}/store`} />
          <Button label="Volunteer" href={`/${org.subdomain}/volunteer`} />
          <Button label="Vendor apply" href={`/${org.subdomain}/vendor-apply`} />
        </div>
      </header>

      {successRegistration ? (
        <section className="vf-section">
          <h2>Registration confirmed</h2>
          <p>
            {successRegistration.user.name ?? successRegistration.user.email} is registered for {successRegistration.event.name} as{" "}
            {successRegistration.type.name}.
          </p>
        </section>
      ) : null}

      {query.cancelled ? (
        <section className="vf-section">
          <h2>Checkout cancelled</h2>
          <p className="vf-muted">No payment was captured. You can restart registration below.</p>
        </section>
      ) : null}

      {!event ? (
        <section className="vf-section">
          <h2>No published event</h2>
          <p className="vf-muted">Registration will open after the organizer publishes an event.</p>
        </section>
      ) : (
        <form action={createRegistration} className="vf-section vf-registration-flow">
          <input type="hidden" name="orgId" value={org.id} />
          <input type="hidden" name="eventId" value={event.id} />
          <div>
            <p className="vf-label">{event.startDate.toLocaleDateString()} - {event.endDate.toLocaleDateString()}</p>
            <h2>{event.name}</h2>
            <p className="vf-muted">{event.description ?? event.venue ?? "Choose a registration tier to continue."}</p>
          </div>
          <div className="vf-tier-grid">
            {event.registrationTypes.map((type, index) => {
              const activeCount = type.registrations.filter((registration) => registration.status !== "CANCELLED").length;
              const soldOut = type.maxCapacity != null && activeCount >= type.maxCapacity;
              const price = getScheduledPrice(type.price, type.scheduledPricing);

              return (
                <label key={type.id} className="vf-tier-option">
                  <input name="typeId" type="radio" value={type.id} required defaultChecked={index === 0 && !soldOut} disabled={soldOut} />
                  <span>
                    <strong>{type.name}</strong>
                    <small>{soldOut ? "Sold out" : `${formatCurrency(price)} current price`}</small>
                  </span>
                </label>
              );
            })}
          </div>
          <div className="vf-form-grid">
            <label>
              Full name
              <input name="attendeeName" required />
            </label>
            <label>
              Email
              <input name="attendeeEmail" type="email" required />
            </label>
          </div>
          <div className="vf-stack">
            <h2>Add-ons</h2>
            {event.registrationTypes.map((type) =>
              type.addOns.map((addOn) => (
                <label key={addOn.id}>
                  {type.name}: {addOn.name} ({addOn.isComplimentary ? "Included" : formatCurrency(addOn.price)})
                  <input name={`addon-${addOn.id}`} type="number" min="0" max={addOn.maxQuantity} defaultValue="0" />
                </label>
              ))
            )}
            {event.registrationTypes.every((type) => type.addOns.length === 0) ? <p className="vf-empty">No add-ons are available.</p> : null}
          </div>
          <label>
            Voucher code
            <input name="voucherCode" placeholder="OPTIONAL" />
          </label>
          <div className="vf-actions">
            <Button label="Continue to Stripe Checkout" name="checkoutMode" value="stripe" type="submit" variant="primary" />
            <Button label="Add to cart" name="checkoutMode" value="cart" type="submit" />
          </div>
        </form>
      )}
    </main>
  );
}
