import { createDepartment, deleteDepartment, updateDepartmentForm } from "@/actions/staff-actions";
import { FormFieldBuilder } from "@/components/forms/form-field-builder";
import type { FormField } from "@/lib/form-fields";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

function parseSchema(value: unknown): FormField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((field): field is FormField => {
    if (!field || typeof field !== "object") {
      return false;
    }

    const candidate = field as Partial<FormField>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.label === "string" &&
      ["text", "select", "checkbox", "textarea"].includes(String(candidate.type))
    );
  });
}

export default async function StaffDepartmentsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      org: {
        include: {
          members: {
            include: {
              user: true
            },
            orderBy: {
              createdAt: "asc"
            }
          }
        }
      },
      departments: {
        include: {
          leadUser: true,
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

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Staff</p>
          <h1>Departments and forms</h1>
        </div>
        <Button label="Public volunteer form" href={`/${event.org.subdomain}/volunteer`} />
      </header>

      <section className="vf-section">
        <h2>Create department</h2>
        <form action={createDepartment} className="vf-form">
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="formSchema" value="[]" />
          <div className="vf-subform-row">
            <label>
              Name
              <input name="name" required placeholder="Registration" />
            </label>
            <label>
              Department lead
              <select name="leadUserId" defaultValue="">
                <option value="">Unassigned</option>
                {event.org.members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.user.name ?? member.user.email}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button label="Create department" type="submit" variant="primary" />
        </form>
      </section>

      <section className="vf-stack">
        {event.departments.map((department) => (
          <div key={department.id} className="vf-section">
            <div className="vf-page-header">
              <div>
                <p className="vf-label">{department.volunteerApplications.length} applications</p>
                <h2>{department.name}</h2>
                <p className="vf-muted">Lead: {department.leadUser?.name ?? department.leadUser?.email ?? "Unassigned"}</p>
              </div>
              <form action={deleteDepartment}>
                <input type="hidden" name="departmentId" value={department.id} />
                <Button label="Delete" type="submit" variant="destructive" size="sm" />
              </form>
            </div>
            <form action={updateDepartmentForm} className="vf-form">
              <input type="hidden" name="departmentId" value={department.id} />
              <div className="vf-subform-row">
                <label>
                  Name
                  <input name="name" defaultValue={department.name} required />
                </label>
                <label>
                  Lead
                  <select name="leadUserId" defaultValue={department.leadUserId ?? ""}>
                    <option value="">Unassigned</option>
                    {event.org.members.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.user.name ?? member.user.email}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <FormFieldBuilder initialFields={parseSchema(department.formSchema)} />
              <Button label="Save department form" type="submit" />
            </form>
          </div>
        ))}
        {event.departments.length === 0 ? <p className="vf-empty">No departments yet.</p> : null}
      </section>
    </div>
  );
}
