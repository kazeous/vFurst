import { submitVolunteerApplication } from "@/actions/staff-actions";
import { getConventionOrg } from "@/lib/convention";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Field = {
  id: string;
  type: "text" | "select" | "checkbox" | "textarea";
  label: string;
  required: boolean;
  options?: string[];
};

function parseSchema(value: unknown): Field[] {
  return Array.isArray(value)
    ? value.filter((field): field is Field => {
        if (!field || typeof field !== "object") {
          return false;
        }

        const candidate = field as Partial<Field>;
        return typeof candidate.id === "string" && typeof candidate.label === "string" && typeof candidate.type === "string";
      })
    : [];
}

export default async function PublicVolunteerPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ success?: string }>;
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
      departments: {
        orderBy: {
          name: "asc"
        }
      }
    }
  });
  const selectedDepartment = event?.departments[0] ?? null;
  const fields = selectedDepartment ? parseSchema(selectedDepartment.formSchema) : [];

  return (
    <main className="vf-public-page">
      <header className="vf-public-header">
        <div>
          <p className="vf-label">{org.name}</p>
          <h1>Volunteer</h1>
        </div>
        <div className="vf-actions">
          <Button label="Register" href={`/${org.subdomain}/register`} />
          <Button label="Vendor apply" href={`/${org.subdomain}/vendor-apply`} />
        </div>
      </header>

      {query.success ? (
        <section className="vf-section">
          <h2>Application submitted</h2>
          <p className="vf-muted">The volunteer team can now review your responses and availability.</p>
        </section>
      ) : null}

      {!event ? (
        <section className="vf-section">
          <h2>No published event</h2>
          <p className="vf-muted">Volunteer applications will open after the organizer publishes an event.</p>
        </section>
      ) : event.departments.length === 0 ? (
        <section className="vf-section">
          <h2>No departments yet</h2>
          <p className="vf-muted">Volunteer applications will open once departments are configured.</p>
        </section>
      ) : (
        <form action={submitVolunteerApplication} className="vf-section vf-form">
          <input type="hidden" name="orgSlug" value={org.subdomain} />
          <div>
            <p className="vf-label">{event.name}</p>
            <h2>Volunteer application</h2>
            <p className="vf-muted">{event.description ?? "Tell the team where you can help."}</p>
          </div>
          <div className="vf-form-grid">
            <label>
              Full name
              <input name="applicantName" required />
            </label>
            <label>
              Email
              <input name="applicantEmail" type="email" required />
            </label>
          </div>
          <div className="vf-form-grid">
            <label>
              First choice
              <select name="departmentId" required defaultValue={selectedDepartment?.id}>
                {event.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Second choice
              <select name="preference2" defaultValue="">
                <option value="">No preference</option>
                {event.departments.map((department) => (
                  <option key={department.id} value={department.name}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Third choice
              <select name="preference3" defaultValue="">
                <option value="">No preference</option>
                {event.departments.map((department) => (
                  <option key={department.id} value={department.name}>
                    {department.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {fields.map((field) => {
            if (field.type === "checkbox") {
              return (
                <label key={field.id} className="vf-check">
                  <input name={`field-${field.id}`} type="checkbox" value="true" />
                  {field.label}
                </label>
              );
            }

            if (field.type === "textarea") {
              return (
                <label key={field.id}>
                  {field.label}
                  <textarea name={`field-${field.id}`} rows={4} required={field.required} />
                </label>
              );
            }

            if (field.type === "select") {
              return (
                <label key={field.id}>
                  {field.label}
                  <select name={`field-${field.id}`} required={field.required}>
                    <option value="">Choose one</option>
                    {(field.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              );
            }

            return (
              <label key={field.id}>
                {field.label}
                <input name={`field-${field.id}`} required={field.required} />
              </label>
            );
          })}
          <section className="vf-stack">
            <h2>Availability</h2>
            {[0, 1, 2].map((index) => (
              <div key={index} className="vf-subform-row">
                <label>
                  Date
                  <input name="availabilityDate" type="date" />
                </label>
                <label>
                  Slots
                  <input name="availabilitySlots" placeholder="morning, afternoon, evening" />
                </label>
              </div>
            ))}
          </section>
          <Button label="Submit application" type="submit" variant="primary" />
        </form>
      )}
    </main>
  );
}
