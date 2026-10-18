import { approveApplication, bulkReviewApplications, rejectApplication } from "@/actions/staff-actions";
import { prisma } from "@vfurst/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

function badgeVariant(status: string) {
  if (status === "APPROVED") {
    return "success";
  }

  if (status === "REJECTED") {
    return "error";
  }

  return "warning";
}

function jsonEntries(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : [];
}

function availabilityText(value: unknown) {
  if (!Array.isArray(value)) {
    return "No availability";
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const availability = entry as { date?: unknown; slots?: unknown };
      const slots = Array.isArray(availability.slots) ? availability.slots.join(", ") : "";
      return `${String(availability.date ?? "")}: ${slots}`;
    })
    .filter(Boolean)
    .join("; ");
}

export default async function StaffApplicationsPage({
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
      departments: {
        include: {
          roles: {
            orderBy: {
              roleName: "asc"
            }
          }
        },
        orderBy: {
          name: "asc"
        }
      },
      volunteerApplications: {
        where: status === "ALL" ? undefined : { status },
        include: {
          department: {
            include: {
              roles: true
            }
          },
          reviewedBy: true,
          portalAccount: { select: { id: true, email: true, name: true } }
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

  const roles = event.departments.flatMap((department) => department.roles.map((role) => ({ ...role, departmentName: department.name })));
  const firstRole = roles[0];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Staff</p>
          <h1>Volunteer applications</h1>
        </div>
        <div className="vf-actions">
          {(["ALL", "PENDING", "APPROVED", "REJECTED"] as StatusFilter[]).map((option) => (
            <Button key={option} label={option} href={`/dashboard/events/${event.id}/staff/applications?status=${option}`} size="sm" />
          ))}
        </div>
      </header>

      <section className="vf-section">
        <h2>Bulk review</h2>
        <form action={bulkReviewApplications} className="vf-form">
          <input type="hidden" name="eventId" value={event.id} />
          <div className="vf-table">
            <div className="vf-table-head">
              <span>Select</span>
              <span>Applicant</span>
              <span>Department</span>
              <span>Status</span>
            </div>
            {event.volunteerApplications.map((application) => (
              <div key={application.id} className="vf-table-row">
                <input type="checkbox" name="applicationId" value={application.id} aria-label={`Select ${application.portalAccount.email}`} />
                <span>{application.portalAccount.name ?? application.portalAccount.email}</span>
                <span>{application.department.name}</span>
                <Badge label={application.status} variant={badgeVariant(application.status)} />
              </div>
            ))}
          </div>
          <div className="vf-subform-row">
            <label>
              Assignment role
              <select name="roleId" defaultValue={firstRole?.id ?? ""}>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.departmentName}: {role.roleName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <DateField name="shiftDate" defaultValue={today} />
            </label>
            <label>
              Start
              <input name="shiftStart" type="time" defaultValue="09:00" />
            </label>
            <label>
              End
              <input name="shiftEnd" type="time" defaultValue="13:00" />
            </label>
            <label>
              Label
              <input name="shiftLabel" defaultValue="General shift" />
            </label>
          </div>
          <div className="vf-actions">
            <Button label="Approve selected" name="action" value="APPROVED" type="submit" isDisabled={roles.length === 0} />
            <Button label="Reject selected" name="action" value="REJECTED" type="submit" variant="destructive" />
          </div>
        </form>
      </section>

      <section className="vf-stack">
        {event.volunteerApplications.map((application) => (
          <div key={application.id} className="vf-section">
            <div className="vf-page-header">
              <div>
                <p className="vf-label">{application.department.name}</p>
                <h2>{application.portalAccount.name ?? application.portalAccount.email}</h2>
                <p className="vf-muted">
                  Applied {application.createdAt.toLocaleDateString()} - Reviewed by{" "}
                  {application.reviewedBy?.name ?? application.reviewedBy?.email ?? "nobody yet"}
                </p>
              </div>
              <Badge label={application.status} variant={badgeVariant(application.status)} />
            </div>
            <dl className="vf-details">
              {jsonEntries(application.formResponses).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
                </div>
              ))}
              <div>
                <dt>Availability</dt>
                <dd>{availabilityText(application.availability)}</dd>
              </div>
            </dl>
            <div className="vf-two-column">
              <form action={approveApplication} className="vf-form">
                <input type="hidden" name="applicationId" value={application.id} />
                <label>
                  Role
                  <select name="roleId" defaultValue={application.department.roles[0]?.id ?? ""}>
                    {application.department.roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.roleName}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="vf-subform-row">
                  <label>
                    Date
                    <DateField name="shiftDate" defaultValue={today} />
                  </label>
                  <label>
                    Start
                    <input name="shiftStart" type="time" defaultValue="09:00" />
                  </label>
                  <label>
                    End
                    <input name="shiftEnd" type="time" defaultValue="13:00" />
                  </label>
                  <label>
                    Label
                    <input name="shiftLabel" defaultValue={`${application.department.name} shift`} />
                  </label>
                </div>
                <Button label="Approve and assign" type="submit" isDisabled={application.department.roles.length === 0} />
              </form>
              <form action={rejectApplication} className="vf-form">
                <input type="hidden" name="applicationId" value={application.id} />
                <label>
                  Rejection reason
                  <textarea name="reason" rows={4} />
                </label>
                <Button label="Reject" type="submit" variant="destructive" />
              </form>
            </div>
          </div>
        ))}
        {event.volunteerApplications.length === 0 ? <p className="vf-empty">No volunteer applications match this filter.</p> : null}
      </section>
    </div>
  );
}
