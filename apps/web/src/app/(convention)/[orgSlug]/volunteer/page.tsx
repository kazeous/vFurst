import { VolunteerForm } from "./volunteer-form";
import { getPortalPageContext } from "@/lib/portal-context";
import { portalLoginPath, portalSignupPath } from "@/lib/portal-paths";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";

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
  const { org, account } = await getPortalPageContext(orgSlug);

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
  const successApplication = query.success && account && event
    ? await prisma.volunteerApplication.findFirst({ where: { id: query.success, orgId: org.id, portalAccountId: account.id, eventId: event.id } })
    : null;

  return (
    <main className="vf-public-page">
      <header className="vf-public-header">
        <div>
          <p className="vf-label">{org.name}</p>
          <h1>Volunteer</h1>
        </div>
        <div className="vf-actions">
          <Button label="Register" href="/register" />
          <Button label="Vendor apply" href="/vendor-apply" />
          <Button label="Account" href="/account" />
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
      ) : !account ? (
        <section className="vf-section">
          <p className="vf-label">Public account required</p>
          <h2>Sign in before applying</h2>
          <p className="vf-muted">Your application status and approved shifts will be saved to your account for this convention.</p>
          <div className="vf-actions"><Button label="Log in" href={portalLoginPath("/volunteer")} variant="primary" /><Button label="Create account" href={portalSignupPath("/volunteer")} /></div>
        </section>
      ) : (
        <VolunteerForm
          orgSlug={org.subdomain}
          eventName={event.name}
          eventDescription={event.description ?? "Tell the team where you can help."}
          departments={event.departments.map((department) => ({ id: department.id, name: department.name }))}
          fields={fields}
          defaultApplicantName={account.name ?? ""}
          applicantEmail={account.email ?? ""}
        />
      )}
    </main>
  );
}
