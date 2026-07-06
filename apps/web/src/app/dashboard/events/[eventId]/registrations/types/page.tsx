import {
  createAddOnDefinition,
  createRegistrationType,
  deleteAddOnDefinition,
  deleteRegistrationType,
  updateAddOnDefinition,
  updateRegistrationType
} from "@/actions/event-actions";
import { SortableTierList } from "@/app/dashboard/events/[eventId]/registrations/types/sortable-tier-list";
import { formatCurrency, parseScheduledPricing } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Button } from "@astryxdesign/core/Button";
import { notFound } from "next/navigation";

export default async function RegistrationTypesPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
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

  if (!event) {
    notFound();
  }

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Registration</p>
          <h1>Registration types</h1>
        </div>
      </header>
      <section className="vf-two-column">
        <div className="vf-section">
          <h2>Tier order</h2>
          <SortableTierList tiers={event.registrationTypes.map((type) => ({ id: type.id, name: type.name }))} />
        </div>
        <div className="vf-section">
          <h2>Create tier</h2>
          <form action={createRegistrationType} className="vf-form">
            <input type="hidden" name="orgId" value={event.orgId} />
            <input type="hidden" name="eventId" value={event.id} />
            <label>
              Name
              <input name="name" required placeholder="Weekend Pass" />
            </label>
            <label>
              Price
              <input name="price" type="number" min="0" step="0.01" required placeholder="85.00" />
            </label>
            <label>
              Capacity
              <input name="maxCapacity" type="number" min="1" placeholder="500" />
            </label>
            <div className="vf-subform-row">
              <label>
                Price start
                <input name="scheduledStart" type="date" />
              </label>
              <label>
                Price end
                <input name="scheduledEnd" type="date" />
              </label>
              <label>
                Scheduled price
                <input name="scheduledPrice" type="number" min="0" step="0.01" />
              </label>
            </div>
            <Button label="Create tier" type="submit" variant="primary" />
          </form>
        </div>
      </section>
      <section className="vf-stack">
        {event.registrationTypes.map((type) => {
          const schedules = parseScheduledPricing(type.scheduledPricing);

          return (
            <div key={type.id} className="vf-section">
              <div className="vf-page-header">
                <div>
                  <h2>{type.name}</h2>
                  <p className="vf-muted">
                    {formatCurrency(type.price)} base - {type.registrations.length} registered
                  </p>
                </div>
                <form action={deleteRegistrationType}>
                  <input type="hidden" name="orgId" value={event.orgId} />
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="typeId" value={type.id} />
                  <Button label="Delete tier" type="submit" variant="destructive" size="sm" />
                </form>
              </div>
              <form action={updateRegistrationType} className="vf-form">
                <input type="hidden" name="orgId" value={event.orgId} />
                <input type="hidden" name="eventId" value={event.id} />
                <input type="hidden" name="typeId" value={type.id} />
                <div className="vf-subform-row">
                  <label>
                    Name
                    <input name="name" defaultValue={type.name} required />
                  </label>
                  <label>
                    Price
                    <input name="price" type="number" min="0" step="0.01" defaultValue={(type.price / 100).toFixed(2)} required />
                  </label>
                  <label>
                    Capacity
                    <input name="maxCapacity" type="number" min="1" defaultValue={type.maxCapacity ?? ""} />
                  </label>
                </div>
                <div className="vf-subform-row">
                  <label>
                    Price start
                    <input name="scheduledStart" type="date" defaultValue={schedules[0]?.startDate.slice(0, 10) ?? ""} />
                  </label>
                  <label>
                    Price end
                    <input name="scheduledEnd" type="date" defaultValue={schedules[0]?.endDate.slice(0, 10) ?? ""} />
                  </label>
                  <label>
                    Scheduled price
                    <input name="scheduledPrice" type="number" min="0" step="0.01" defaultValue={schedules[0] ? (schedules[0].price / 100).toFixed(2) : ""} />
                  </label>
                </div>
                <Button label="Save tier" type="submit" />
              </form>
              <div className="vf-stack">
                <h3>Add-ons</h3>
                {type.addOns.map((addOn) => (
                  <form key={addOn.id} action={updateAddOnDefinition} className="vf-subform-row">
                    <input type="hidden" name="orgId" value={event.orgId} />
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="typeId" value={type.id} />
                    <input type="hidden" name="addOnId" value={addOn.id} />
                    <label>
                      Name
                      <input name="name" defaultValue={addOn.name} required />
                    </label>
                    <label>
                      Price
                      <input name="price" type="number" min="0" step="0.01" defaultValue={(addOn.price / 100).toFixed(2)} />
                    </label>
                    <label>
                      Max quantity
                      <input name="maxQuantity" type="number" min="1" defaultValue={addOn.maxQuantity} />
                    </label>
                    <label className="vf-check">
                      <input name="isComplimentary" type="checkbox" defaultChecked={addOn.isComplimentary} />
                      Comp
                    </label>
                    <Button label="Save" type="submit" size="sm" />
                  </form>
                ))}
                {type.addOns.map((addOn) => (
                  <form key={`${addOn.id}-delete`} action={deleteAddOnDefinition}>
                    <input type="hidden" name="orgId" value={event.orgId} />
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="addOnId" value={addOn.id} />
                    <Button label={`Delete ${addOn.name}`} type="submit" size="sm" variant="destructive" />
                  </form>
                ))}
                <form action={createAddOnDefinition} className="vf-subform-row">
                  <input type="hidden" name="orgId" value={event.orgId} />
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="typeId" value={type.id} />
                  <label>
                    Name
                    <input name="name" placeholder="T-shirt" required />
                  </label>
                  <label>
                    Price
                    <input name="price" type="number" min="0" step="0.01" placeholder="25.00" />
                  </label>
                  <label>
                    Max quantity
                    <input name="maxQuantity" type="number" min="1" defaultValue="1" />
                  </label>
                  <label className="vf-check">
                    <input name="isComplimentary" type="checkbox" />
                    Comp
                  </label>
                  <Button label="Add" type="submit" size="sm" />
                </form>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

