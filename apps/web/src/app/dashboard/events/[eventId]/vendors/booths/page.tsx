import { assignBooth, saveBoothConfig } from "@/actions/vendor-actions";
import { formatCurrency, formatMoneyInput } from "@/lib/registration/pricing";
import { getVendorConfig } from "@/lib/vendor/config";
import { prisma } from "@vfurst/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function boothVariant(status: string) {
  if (status === "PAID") {
    return "success";
  }

  if (status === "ASSIGNED") {
    return "warning";
  }

  return "info";
}

export default async function VendorBoothsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      org: true,
      vendorApplications: {
        where: {
          status: "APPROVED"
        },
        include: {
          portalAccount: true
        },
        orderBy: {
          businessName: "asc"
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  const config = getVendorConfig(event.settings);

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Vendors</p>
          <h1>Booths and table products</h1>
        </div>
        <Button label="Applications" href={`/dashboard/events/${event.id}/vendors`} />
      </header>

      <section className="vf-section">
        <h2>Table types and amenities</h2>
        <form action={saveBoothConfig} className="vf-form">
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="orgSlug" value={event.org.subdomain} />
          <div className="vf-stack">
            <h3>Table types</h3>
            {[...config.tableTypes, { id: "new-table", name: "", price: 0 }].map((table, index) => (
              <div key={`${table.id}-${index}`} className="vf-subform-row">
                <label>
                  Name
                  <input name="tableName" defaultValue={table.name} placeholder="Artist alley table" />
                </label>
                <label>
                  Price
                  <input
                    name="tablePrice"
                    type="number"
                    min="0"
                    step={event.currency === "VND" ? "1" : "0.01"}
                    defaultValue={formatMoneyInput(table.price, event.currency)}
                  />
                </label>
              </div>
            ))}
          </div>
          <div className="vf-stack">
            <h3>Amenities</h3>
            {[...config.amenities, { id: "new-amenity", name: "", price: 0 }].map((amenity, index) => (
              <div key={`${amenity.id}-${index}`} className="vf-subform-row">
                <label>
                  Name
                  <input name="amenityName" defaultValue={amenity.name} placeholder="Power drop" />
                </label>
                <label>
                  Price
                  <input
                    name="amenityPrice"
                    type="number"
                    min="0"
                    step={event.currency === "VND" ? "1" : "0.01"}
                    defaultValue={formatMoneyInput(amenity.price, event.currency)}
                  />
                </label>
              </div>
            ))}
          </div>
          <div className="vf-stack">
            <h3>Booth layout</h3>
            {[...config.booths, { id: "new-booth", label: "", tableType: "", status: "AVAILABLE" as const }].map((booth, index) => (
              <div key={`${booth.id}-${index}`} className="vf-subform-row">
                <label>
                  Booth
                  <input name="boothLabel" defaultValue={booth.label} placeholder="A-01" />
                </label>
                <label>
                  Table type
                  <select name="boothTableType" defaultValue={booth.tableType ?? ""}>
                    <option value="">Any table</option>
                    {config.tableTypes.map((table) => (
                      <option key={table.id} value={table.name}>
                        {table.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
          <Button label="Save booth setup" type="submit" variant="primary" />
        </form>
      </section>

      <section className="vf-section">
        <h2>Booth map</h2>
        <div className="vf-booth-grid">
          {config.booths.map((booth) => {
            const assignedVendor = event.vendorApplications.find(
              (application) => application.id === booth.vendorApplicationId || application.boothAssignment === booth.label
            );
            const status = assignedVendor?.boothPaidAt ? "PAID" : booth.status;

            return (
              <div key={booth.id} className="vf-booth-cell">
                <div className="vf-page-header">
                  <div>
                    <h3>{booth.label}</h3>
                    <p className="vf-muted">{booth.tableType || "Any table"}</p>
                  </div>
                  <Badge label={status} variant={boothVariant(status)} />
                </div>
                <p>{assignedVendor?.businessName ?? "Available"}</p>
                <form action={assignBooth} className="vf-form">
                  <input type="hidden" name="boothId" value={booth.id} />
                  <label>
                    Assign vendor
                    <select name="applicationId" required defaultValue={assignedVendor?.id ?? ""}>
                      <option value="">Choose vendor</option>
                      {event.vendorApplications.map((application) => (
                        <option key={application.id} value={application.id}>
                          {application.businessName} - {formatCurrency(application.boothPrice, event.currency)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button label="Assign booth" type="submit" size="sm" />
                </form>
              </div>
            );
          })}
          {config.booths.length === 0 ? <p className="vf-empty">Add booth labels to build the layout grid.</p> : null}
        </div>
      </section>
    </div>
  );
}
