import { assignShift, createStaffRole, deleteStaffRole, massEmailDepartment, removeAssignment } from "@/actions/staff-actions";
import { ShiftAssignmentBoard } from "@/app/dashboard/events/[eventId]/staff/schedule/shift-assignment-board";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type ShiftSlot = {
  date: string;
  startTime: string;
  endTime: string;
  label: string;
};

function parseShifts(value: unknown): ShiftSlot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((shift): shift is ShiftSlot => {
    if (!shift || typeof shift !== "object") {
      return false;
    }

    const candidate = shift as Partial<ShiftSlot>;
    return (
      typeof candidate.date === "string" &&
      typeof candidate.startTime === "string" &&
      typeof candidate.endTime === "string" &&
      typeof candidate.label === "string"
    );
  });
}

function shiftMatchesAvailability(availability: unknown, shift: ShiftSlot) {
  if (!Array.isArray(availability)) {
    return false;
  }

  return availability.some((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    const candidate = entry as { date?: unknown; slots?: unknown };
    const slots = Array.isArray(candidate.slots) ? candidate.slots.map((slot) => String(slot).toLowerCase()) : [];
    const label = `${shift.label} ${shift.startTime}`.toLowerCase();

    return candidate.date === shift.date && (slots.some((slot) => label.includes(slot)) || slots.length > 0);
  });
}

function assignmentShiftLabel(value: unknown) {
  const shift = parseShifts([value])[0];
  return shift ? `${shift.label} ${shift.date} ${shift.startTime}-${shift.endTime}` : "Shift";
}

export default async function StaffSchedulePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      departments: {
        include: {
          volunteerApplications: {
            where: {
              status: "APPROVED"
            },
            include: {
              user: true,
              staffAssignments: true
            },
            orderBy: {
              createdAt: "desc"
            }
          },
          roles: {
            include: {
              assignments: {
                where: {
                  status: {
                    not: "CANCELLED"
                  }
                },
                include: {
                  user: true,
                  volunteerApplication: true
                }
              }
            },
            orderBy: {
              roleName: "asc"
            }
          }
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

  const today = new Date().toISOString().slice(0, 10);
  const boardVolunteers = event.departments.flatMap((department) =>
    department.volunteerApplications.map((application) => ({
      id: application.id,
      departmentId: department.id,
      name: application.user.name ?? application.user.email
    }))
  );
  const boardShifts = event.departments.flatMap((department) =>
    department.roles.flatMap((role) =>
      parseShifts(role.shifts).map((shift, index) => ({
        id: `${role.id}-${index}`,
        roleId: role.id,
        departmentId: department.id,
        ...shift
      }))
    )
  );

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Staff</p>
          <h1>Shift schedule</h1>
          <p className="vf-muted">Build role shifts, assign approved volunteers, and email teams.</p>
        </div>
      </header>

      <section className="vf-section">
        <h2>Create role and shifts</h2>
        <form action={createStaffRole} className="vf-form">
          <input type="hidden" name="orgId" value={event.orgId} />
          <input type="hidden" name="eventId" value={event.id} />
          <div className="vf-subform-row">
            <label>
              Department
              <select name="departmentId" required>
                {event.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Role name
              <input name="roleName" required placeholder="Badge check-in" />
            </label>
            <label>
              Max volunteers
              <input name="maxVolunteers" type="number" min="1" />
            </label>
          </div>
          <div className="vf-subform-row">
            <label>
              Date
              <input name="shiftDate" type="date" defaultValue={today} required />
            </label>
            <label>
              Start
              <input name="shiftStart" type="time" defaultValue="09:00" required />
            </label>
            <label>
              End
              <input name="shiftEnd" type="time" defaultValue="13:00" required />
            </label>
            <label>
              Label
              <input name="shiftLabel" defaultValue="Morning" required />
            </label>
          </div>
          <Button label="Create role" type="submit" variant="primary" />
        </form>
      </section>

      <ShiftAssignmentBoard orgId={event.orgId} eventId={event.id} volunteers={boardVolunteers} shifts={boardShifts} />

      <section className="vf-stack">
        {event.departments.map((department) => (
          <div key={department.id} className="vf-section">
            <div className="vf-page-header">
              <div>
                <p className="vf-label">{department.roles.length} roles</p>
                <h2>{department.name}</h2>
              </div>
              <form action={massEmailDepartment} className="vf-inline-form">
                <input type="hidden" name="orgId" value={event.orgId} />
                <input type="hidden" name="eventId" value={event.id} />
                <input type="hidden" name="departmentId" value={department.id} />
                <input name="subject" placeholder="Subject" required />
                <input name="message" placeholder="Message" required />
                <Button label="Email department" type="submit" size="sm" />
              </form>
            </div>
            <div className="vf-schedule-grid">
              {department.roles.map((role) => {
                const shifts = parseShifts(role.shifts);

                return (
                  <div key={role.id} className="vf-schedule-role">
                    <div className="vf-page-header">
                      <div>
                        <h3>{role.roleName}</h3>
                        <p className="vf-muted">{role.maxVolunteers ?? "Unlimited"} max volunteers</p>
                      </div>
                      <form action={deleteStaffRole}>
                        <input type="hidden" name="orgId" value={event.orgId} />
                        <input type="hidden" name="eventId" value={event.id} />
                        <input type="hidden" name="roleId" value={role.id} />
                        <Button label="Delete" type="submit" variant="destructive" size="sm" />
                      </form>
                    </div>
                    {shifts.map((shift, index) => {
                      const assignmentsForShift = role.assignments.filter((assignment) => assignmentShiftLabel(assignment.shiftSlot).includes(shift.label));
                      const suggested = department.volunteerApplications.filter((application) =>
                        shiftMatchesAvailability(application.availability, shift)
                      );

                      return (
                        <div key={`${role.id}-${index}`} className="vf-shift-card">
                          <h4>
                            {shift.label} - {shift.date}
                          </h4>
                          <p className="vf-muted">
                            {shift.startTime}-{shift.endTime} - {assignmentsForShift.length} assigned
                          </p>
                          <div className="vf-list">
                            {assignmentsForShift.map((assignment) => (
                              <div key={assignment.id} className="vf-list-row">
                                <span>{assignment.user.name ?? assignment.user.email}</span>
                                <form action={removeAssignment}>
                                  <input type="hidden" name="orgId" value={event.orgId} />
                                  <input type="hidden" name="eventId" value={event.id} />
                                  <input type="hidden" name="assignmentId" value={assignment.id} />
                                  <Button label="Remove" type="submit" size="sm" />
                                </form>
                              </div>
                            ))}
                          </div>
                          <form action={assignShift} className="vf-form">
                            <input type="hidden" name="orgId" value={event.orgId} />
                            <input type="hidden" name="eventId" value={event.id} />
                            <input type="hidden" name="roleId" value={role.id} />
                            <input type="hidden" name="shiftDate" value={shift.date} />
                            <input type="hidden" name="shiftStart" value={shift.startTime} />
                            <input type="hidden" name="shiftEnd" value={shift.endTime} />
                            <input type="hidden" name="shiftLabel" value={shift.label} />
                            <label>
                              Assign volunteer
                              <select name="applicationId" required>
                                {department.volunteerApplications.map((application) => (
                                  <option key={application.id} value={application.id}>
                                    {application.user.name ?? application.user.email}
                                    {suggested.some((item) => item.id === application.id) ? " - suggested" : ""}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <Button label="Assign shift" type="submit" size="sm" isDisabled={department.volunteerApplications.length === 0} />
                          </form>
                        </div>
                      );
                    })}
                    {shifts.length === 0 ? <p className="vf-empty">This role has no shifts.</p> : null}
                  </div>
                );
              })}
              {department.roles.length === 0 ? <p className="vf-empty">No roles yet.</p> : null}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
