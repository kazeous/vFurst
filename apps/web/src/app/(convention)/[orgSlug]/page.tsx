import { resolveOrganization } from "@/lib/subdomain";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export default async function ConventionHomePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const headerList = await headers();
  const host = headerList.get("x-vfurst-org-host") ?? `${orgSlug}.vfurst.app`;
  const org = await resolveOrganization(host);

  if (!org) {
    notFound();
  }

  return (
    <main className="vf-convention-page">
      <p className="vf-label">Convention portal</p>
      <h1>{org.name}</h1>
      <p>Public event registration and attendee workflows will build on this routed tenant context in later phases.</p>
    </main>
  );
}

