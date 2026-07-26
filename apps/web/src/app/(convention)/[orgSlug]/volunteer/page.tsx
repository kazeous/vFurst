import { VolunteerForm } from "./volunteer-form";
import { getCentralAppUrl, getCentralLoginUrl, getCentralPortalPath, getCentralRegistrationUrl } from "@/lib/central-url";
import { getConventionOrg, getConventionPortalRootForRequest } from "@/lib/convention";
import { auth } from "@/lib/auth";
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
  const [{ orgSlug }, query, session] = await Promise.all([params, searchParams, auth()]);
  const org = await getConventionOrg(orgSlug);

  if (!org) {
    notFound();
  }
  const portalRoot = await getConventionPortalRootForRequest(org);
  const centralPath = getCentralPortalPath(org.subdomain, "/volunteer");

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
  const successApplication = query.success && session?.user?.id && event
    ? await prisma.volunteerApplication.findFirst({ where: { id: query.success, orgId: org.id, userId: session.user.id, eventId: event.id } })
    : null;

  return (
    <main className="vf-public-page">
      <header className="vf-public-header">
        <div>
          <p className="vf-label">{org.name}</p>
          <h1>Volunteer</h1>
        </div>
        <div className="vf-actions">
          <Button label="Register" href={`${portalRoot}/register`} />
          <Button label="Vendor apply" href={`${portalRoot}/vendor-apply`} />
          <Button label="Account" href={getCentralAppUrl("/account")} />
        </div>
      </header>

      {successApplication ? (
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
      ) : !session?.user?.id ? (
        <section className="vf-section">
          <p className="vf-label">Public account required</p>
          <h2>Sign in before applying</h2>
          <p className="vf-muted">Your application status and approved shifts will be saved to your central vFurst account.</p>
          <div className="vf-actions"><Button label="Log in" href={getCentralLoginUrl(centralPath)} variant="primary" /><Button label="Create account" href={getCentralRegistrationUrl(centralPath)} /></div>
        </section>
      ) : (
        <VolunteerForm
          orgSlug={org.subdomain}
          eventName={event.name}
          eventDescription={event.description ?? "Tell the team where you can help."}
          departments={event.departments.map((department) => ({ id: department.id, name: department.name }))}
          fields={fields}
          defaultApplicantName={session.user.name ?? ""}
          applicantEmail={session.user.email ?? ""}
        />
      )}
    </main>
  );
}
