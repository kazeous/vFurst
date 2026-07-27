import { payVendorBooth } from "@/actions/vendor-actions";
import { VendorApplyForm } from "./vendor-apply-form";
import { getCentralAppUrl, getCentralLoginUrl, getCentralPortalPath, getCentralRegistrationUrl } from "@/lib/central-url";
import { getConventionOrg, getConventionPortalRootForRequest } from "@/lib/convention";
import { auth } from "@/lib/auth";
import { formatCurrency } from "@/lib/registration/pricing";
import { getVendorConfig } from "@/lib/vendor/config";
import { prisma } from "@vfurst/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionStateForm } from "@/components/action-state-form";
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
  const [{ orgSlug }, query, session] = await Promise.all([params, searchParams, auth()]);
  const org = await getConventionOrg(orgSlug);

  if (!org) {
    notFound();
  }
  const portalRoot = await getConventionPortalRootForRequest(org);
  const centralPath = getCentralPortalPath(org.subdomain, "/vendor-apply");

  const event = await prisma.event.findFirst({
    where: {
      orgId: org.id,
      status: "PUBLISHED"
    },
    orderBy: {
      startDate: "asc"
    }
  });
  const successApplication = query.success && session?.user?.id
    ? event
      ? await prisma.vendorApplication.findFirst({
        where: {
          id: query.success,
          orgId: org.id,
          eventId: event.id,
          userId: session.user.id
        },
        include: {
          event: true
        }
        })
      : null
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
          <Button label="Register" href={`${portalRoot}/register`} />
          <Button label="Volunteer" href={`${portalRoot}/volunteer`} />
          <Button label="Account" href={getCentralAppUrl("/account")} />
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
                {formatCurrency(successApplication.boothPrice, successApplication.event.currency)}
              </p>
            </div>
            <Badge label={successApplication.status} variant={statusVariant(successApplication.status)} />
          </div>
          {successApplication.status === "APPROVED" && successApplication.boothAssignment && !successApplication.boothPaidAt ? (
            <ActionStateForm action={payVendorBooth} errorTestId="vendor-booth-payment-error">
              <input type="hidden" name="applicationId" value={successApplication.id} />
              <input type="hidden" name="orgSlug" value={org.subdomain} />
              <Button label="Pay booth invoice" type="submit" variant="primary" />
            </ActionStateForm>
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
      ) : !session?.user?.id ? (
        <section className="vf-section">
          <p className="vf-label">Public account required</p>
          <h2>Sign in before applying</h2>
          <p className="vf-muted">Your application, booth assignment, and payment status will be saved to your central vFurst account.</p>
          <div className="vf-actions"><Button label="Log in" href={getCentralLoginUrl(centralPath)} variant="primary" /><Button label="Create account" href={getCentralRegistrationUrl(centralPath)} /></div>
        </section>
      ) : (
        <VendorApplyForm
          orgSlug={org.subdomain}
          eventName={event.name}
          eventDescription={event.description ?? "Share business details, assistants, preferences, and requested table products."}
          tableTypes={config.tableTypes.map((table) => ({
            id: table.id,
            label: `${table.name} - ${formatCurrency(table.price, event.currency)}`
          }))}
          amenities={config.amenities.map((amenity) => ({
            id: amenity.id,
            label: `${amenity.name} (${formatCurrency(amenity.price, event.currency)})`
          }))}
          defaultContactName={session.user.name ?? ""}
          contactEmail={session.user.email ?? ""}
        />
      )}
    </main>
  );
}
