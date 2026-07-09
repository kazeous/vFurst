import { StatCard } from "@/components/dashboard/stat-card";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function shiftCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

export default async function StaffOverviewPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      org: true,
      departments: {
        include: {
          leadUser: true,
          roles: {
            include: {
              assignments: true
            }
          },
          volunteerApplications: true
        },
        orderBy: {
          name: "asc"
        }
      }
    }
  });

  if (!event) {
    notFound();
  }

  const totalVolunteers = event.departments.reduce(
    (sum, department) =>
      sum +
      department.roles.reduce(
        (roleSum, role) => roleSum + role.assignments.filter((assignment) => assignment.status !== "CANCELLED").length,
        0
      ),
    0
  );
  const totalShiftSlots = event.departments.reduce(
    (sum, department) => sum + department.roles.reduce((roleSum, role) => roleSum + shiftCount(role.shifts), 0),
    0
  );
  const filledShifts = event.departments.reduce(
    (sum, department) =>
      sum +
      department.roles.reduce(
        (roleSum, role) => roleSum + role.assignments.filter((assignment) => assignment.status !== "CANCELLED").length,
        0
      ),
    0
  );
  const pendingApplications = event.departments.reduce(
    (sum, department) =>
      sum + department.volunteerApplications.filter((application) => application.status === "PENDING").length,
    0
  );

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Staff</p>
          <h1>Volunteer operations</h1>
          <p className="vf-muted">Departments, applications, and shift coverage for {event.name}.</p>
        </div>
        <div className="vf-actions">
          <Button label="Departments" href={`/dashboard/events/${event.id}/staff/departments`} />
          <Button label="Applications" href={`/dashboard/events/${event.id}/staff/applications`} />
          <Button label="Schedule" href={`/dashboard/events/${event.id}/staff/schedule`} variant="primary" />
        </div>
      </header>

      <section className="vf-stat-grid">
        <StatCard label="Departments" value={event.departments.length.toString()} detail="Configured volunteer teams" progress={60} />
        <StatCard label="Volunteers" value={totalVolunteers.toString()} detail="Assigned active volunteers" progress={70} />
        <StatCard label="Unfilled shifts" value={Math.max(totalShiftSlots - filledShifts, 0).toString()} detail="Open scheduled slots" progress={45} />
        <StatCard label="Pending apps" value={pendingApplications.toString()} detail="Need review" progress={35} />
      </section>

      <section className="vf-section">
        <h2>Departments</h2>
        <div className="vf-list">
          {event.departments.map((department) => {
            const roleCount = department.roles.length;
            const assignments = department.roles.reduce(
              (sum, role) => sum + role.assignments.filter((assignment) => assignment.status !== "CANCELLED").length,
              0
            );

            return (
              <a key={department.id} className="vf-list-row" href={`/dashboard/events/${event.id}/staff/departments`}>
                <span>{department.name}</span>
                <small>
                  {department.leadUser?.name ?? "No lead"} - {roleCount} roles - {assignments} assigned
                </small>
              </a>
            );
          })}
          {event.departments.length === 0 ? <p className="vf-empty">Create departments before opening volunteer applications.</p> : null}
        </div>
      </section>
    </div>
  );
}
