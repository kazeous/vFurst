import { addAssistant, approveVendor, bulkReviewVendors, rejectVendor, waitlistVendor } from "@/actions/vendor-actions";
import { formatCurrency } from "@/lib/registration/pricing";
import { prisma } from "@vfurst/db";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED" | "WAITLISTED";

function badgeVariant(status: string) {
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

function jsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function jsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export default async function VendorsPage({
  params,
  searchParams
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ status?: StatusFilter }>;
}) {
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const status = query.status ?? "ALL";
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      org: true,
      vendorApplications: {
        where: status === "ALL" ? undefined : { status },
        include: {
          user: true
        },
        orderBy: {
          createdAt: "desc"
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
          <p className="vf-label">Vendors</p>
          <h1>Vendor applications</h1>
        </div>
        <div className="vf-actions">
          <Button label="Public application" href={`/${event.org.subdomain}/vendor-apply`} />
          <Button label="Booths" href={`/dashboard/events/${event.id}/vendors/booths`} variant="primary" />
        </div>
      </header>

      <section className="vf-actions">
        {(["ALL", "PENDING", "APPROVED", "WAITLISTED", "REJECTED"] as StatusFilter[]).map((option) => (
          <Button key={option} label={option} href={`/dashboard/events/${event.id}/vendors?status=${option}`} size="sm" />
        ))}
      </section>

      <section className="vf-section">
        <h2>Bulk review</h2>
        <form action={bulkReviewVendors} className="vf-form">
          <input type="hidden" name="orgId" value={event.orgId} />
          <input type="hidden" name="eventId" value={event.id} />
          <div className="vf-table">
            <div className="vf-table-head">
              <span>Select</span>
              <span>Business</span>
              <span>Table</span>
              <span>Status</span>
            </div>
            {event.vendorApplications.map((application) => (
              <div key={application.id} className="vf-table-row">
                <input type="checkbox" name="applicationId" value={application.id} aria-label={`Select ${application.businessName}`} />
                <span>{application.businessName}</span>
                <span>{application.tableType ?? "Not selected"}</span>
                <Badge label={application.status} variant={badgeVariant(application.status)} />
              </div>
            ))}
          </div>
          <div className="vf-actions">
            <Button label="Approve selected" name="status" value="APPROVED" type="submit" />
            <Button label="Waitlist selected" name="status" value="WAITLISTED" type="submit" />
            <Button label="Reject selected" name="status" value="REJECTED" type="submit" variant="destructive" />
          </div>
        </form>
      </section>

      <section className="vf-stack">
        {event.vendorApplications.map((application) => {
          const assistants = jsonArray(application.assistants);
          const amenities = jsonArray(application.amenities);
          const files = jsonArray(application.files);
          const preferences = jsonObject(application.preferences);

          return (
            <div key={application.id} className="vf-section">
              <div className="vf-page-header">
                <div>
                  <p className="vf-label">{application.user.email}</p>
                  <h2>{application.businessName}</h2>
                  <p className="vf-muted">
                    {application.tableType ?? "No table type"} - {formatCurrency(application.boothPrice)} - Booth{" "}
                    {application.boothAssignment ?? "unassigned"} - {application.boothPaidAt ? "paid" : "unpaid"}
                  </p>
                </div>
                <Badge label={application.status} variant={badgeVariant(application.status)} />
              </div>
              <dl className="vf-details">
                <div>
                  <dt>Contact</dt>
                  <dd>{application.contactName ?? application.user.name ?? application.user.email}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{application.contactEmail ?? application.user.email}</dd>
                </div>
                <div>
                  <dt>Website</dt>
                  <dd>{application.website ?? "None"}</dd>
                </div>
                <div>
                  <dt>Products</dt>
                  <dd>{application.productDescription ?? "No description"}</dd>
                </div>
                <div>
                  <dt>Amenities</dt>
                  <dd>
                    {amenities
                      .map((amenity) => (typeof amenity === "object" && amenity ? String((amenity as { name?: unknown }).name ?? "") : ""))
                      .filter(Boolean)
                      .join(", ") || "None"}
                  </dd>
                </div>
                <div>
                  <dt>Preferences</dt>
                  <dd>
                    Neighbor: {String(preferences.neighbor ?? "none")} / Location: {String(preferences.location ?? "none")}
                  </dd>
                </div>
              </dl>
              <div className="vf-two-column">
                <div className="vf-stack">
                  <h3>Assistants</h3>
                  <div className="vf-list">
                    {assistants.map((assistant, index) => {
                      const row = jsonObject(assistant);
                      return (
                        <div key={index} className="vf-list-row">
                          <span>{String(row.name ?? "Unnamed")}</span>
                          <small>{String(row.email ?? "")}</small>
                        </div>
                      );
                    })}
                    {assistants.length === 0 ? <p className="vf-empty">No assistants listed.</p> : null}
                  </div>
                  <form action={addAssistant} className="vf-subform-row">
                    <input type="hidden" name="orgId" value={event.orgId} />
                    <input type="hidden" name="eventId" value={event.id} />
                    <input type="hidden" name="applicationId" value={application.id} />
                    <label>
                      Assistant name
                      <input name="assistantName" required />
                    </label>
                    <label>
                      Email
                      <input name="assistantEmail" type="email" />
                    </label>
                    <Button label="Add" type="submit" size="sm" />
                  </form>
                </div>
                <div className="vf-stack">
                  <h3>Files</h3>
                  {files.length > 0 ? (
                    files.map((file) => (
                      <a key={String(file)} href={String(file)}>
                        {String(file)}
                      </a>
                    ))
                  ) : (
                    <p className="vf-empty">No files uploaded.</p>
                  )}
                </div>
              </div>
              <div className="vf-inline-forms">
                <form action={approveVendor} className="vf-inline-form">
                  <input type="hidden" name="orgId" value={event.orgId} />
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="applicationId" value={application.id} />
                  <input name="boothPrice" type="number" step="0.01" min="0" defaultValue={(application.boothPrice / 100).toFixed(2)} />
                  <Button label="Approve" type="submit" size="sm" />
                </form>
                <form action={waitlistVendor} className="vf-inline-form">
                  <input type="hidden" name="orgId" value={event.orgId} />
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="applicationId" value={application.id} />
                  <input name="note" placeholder="Optional note" />
                  <Button label="Waitlist" type="submit" size="sm" />
                </form>
                <form action={rejectVendor} className="vf-inline-form">
                  <input type="hidden" name="orgId" value={event.orgId} />
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="applicationId" value={application.id} />
                  <input name="note" placeholder="Optional note" />
                  <Button label="Reject" type="submit" size="sm" variant="destructive" />
                </form>
              </div>
            </div>
          );
        })}
        {event.vendorApplications.length === 0 ? <p className="vf-empty">No vendor applications match this filter.</p> : null}
      </section>
    </div>
  );
}
