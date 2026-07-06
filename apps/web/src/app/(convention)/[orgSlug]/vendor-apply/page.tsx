import { payVendorBooth, submitApplication } from "@/actions/vendor-actions";
import { getConventionOrg } from "@/lib/convention";
import { formatCurrency } from "@/lib/registration/pricing";
import { getVendorConfig } from "@/lib/vendor/config";
import { prisma } from "@vfurst/db";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function statusVariant(status: string) {
  if (status === "APPROVED") {
    return "success";
  }

  if (status === "REJECTED") {
    return "error";
  }

  if (status === "WAITLISTED") {
    return "info";
  }

  return "warning";
}

export default async function PublicVendorApplyPage({
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
    }
  });
  const successApplication = query.success
    ? await prisma.vendorApplication.findFirst({
        where: {
          id: query.success,
          orgId: org.id
        },
        include: {
          event: true
        }
      })
    : null;
  const config = event ? getVendorConfig(event.settings) : { tableTypes: [], amenities: [], booths: [] };

  return (
    <main className="vf-public-page">
      <header className="vf-public-header">
        <div>
          <p className="vf-label">{org.name}</p>
          <h1>Vendor application</h1>
        </div>
        <div className="vf-actions">
          <Button label="Register" href={`/${org.subdomain}/register`} />
          <Button label="Volunteer" href={`/${org.subdomain}/volunteer`} />
        </div>
      </header>

      {successApplication ? (
        <section className="vf-section">
          <div className="vf-page-header">
            <div>
              <p className="vf-label">{successApplication.event.name}</p>
              <h2>{successApplication.businessName}</h2>
              <p className="vf-muted">
                Booth: {successApplication.boothAssignment ?? "not assigned"} - Price{" "}
                {formatCurrency(successApplication.boothPrice)}
              </p>
            </div>
            <Badge label={successApplication.status} variant={statusVariant(successApplication.status)} />
          </div>
          {successApplication.status === "APPROVED" && successApplication.boothAssignment && !successApplication.boothPaidAt ? (
            <form action={payVendorBooth}>
              <input type="hidden" name="applicationId" value={successApplication.id} />
              <Button label="Pay booth invoice" type="submit" variant="primary" />
            </form>
          ) : null}
          {successApplication.boothPaidAt ? <p className="vf-muted">Booth payment is complete.</p> : null}
        </section>
      ) : null}

      {query.cancelled ? (
        <section className="vf-section">
          <h2>Payment cancelled</h2>
          <p className="vf-muted">No booth payment was captured.</p>
        </section>
      ) : null}

      {!event ? (
        <section className="vf-section">
          <h2>No published event</h2>
          <p className="vf-muted">Vendor applications will open after the organizer publishes an event.</p>
        </section>
      ) : (
        <form action={submitApplication} className="vf-section vf-form" encType="multipart/form-data">
          <input type="hidden" name="orgId" value={org.id} />
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="orgSlug" value={org.subdomain} />
          <div>
            <p className="vf-label">{event.name}</p>
            <h2>Apply for dealer space</h2>
            <p className="vf-muted">{event.description ?? "Share business details, assistants, preferences, and requested table products."}</p>
          </div>
          <div className="vf-form-grid">
            <label>
              Contact name
              <input name="contactName" required />
            </label>
            <label>
              Contact email
              <input name="contactEmail" type="email" required />
            </label>
          </div>
          <div className="vf-form-grid">
            <label>
              Business name
              <input name="businessName" required />
            </label>
            <label>
              Website
              <input name="website" placeholder="https://..." />
            </label>
          </div>
          <label>
            Product description
            <textarea name="productDescription" rows={4} required />
          </label>
          <div className="vf-form-grid">
            <label>
              Table type
              <select name="tableType" defaultValue={config.tableTypes[0]?.id ?? ""}>
                <option value="">No table selected</option>
                {config.tableTypes.map((table) => (
                  <option key={table.id} value={table.id}>
                    {table.name} - {formatCurrency(table.price)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Neighbor preference
              <input name="neighborPreference" placeholder="Near / away from..." />
            </label>
            <label>
              Location preference
              <input name="locationPreference" placeholder="End cap, wall, quiet area" />
            </label>
          </div>
          <section className="vf-stack">
            <h2>Amenities</h2>
            {config.amenities.map((amenity) => (
              <label key={amenity.id} className="vf-check">
                <input name="amenityId" type="checkbox" value={amenity.id} />
                {amenity.name} ({formatCurrency(amenity.price)})
              </label>
            ))}
            {config.amenities.length === 0 ? <p className="vf-empty">No paid amenities are configured.</p> : null}
          </section>
          <section className="vf-stack">
            <h2>Dealer assistants</h2>
            {[0, 1, 2].map((index) => (
              <div key={index} className="vf-subform-row">
                <label>
                  Assistant name
                  <input name="assistantName" />
                </label>
                <label>
                  Assistant email
                  <input name="assistantEmail" type="email" />
                </label>
              </div>
            ))}
          </section>
          <section className="vf-stack">
            <h2>Files</h2>
            <div className="vf-subform-row">
              <label>
                File URL
                <input name="fileUrl" placeholder="https://..." />
              </label>
              <label>
                Upload file
                <input name="fileUpload" type="file" />
              </label>
            </div>
          </section>
          <Button label="Submit vendor application" type="submit" variant="primary" />
        </form>
      )}
    </main>
  );
}
