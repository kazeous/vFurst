import { getConventionOrg } from "@/lib/convention";
import { Button } from "@astryxdesign/core/Button";
import { notFound } from "next/navigation";

export default async function ConventionHomePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getConventionOrg(orgSlug);

  if (!org) {
    notFound();
  }

  return (
    <main className="vf-convention-page">
      <p className="vf-label">Convention portal</p>
      <h1>{org.name}</h1>
      <p>Registration, hotel booking, store orders, volunteer applications, and vendor applications are open for published events.</p>
      <div className="vf-actions">
        <Button label="Register" href={`/${org.subdomain}/register`} variant="primary" />
        <Button label="Hotel" href={`/${org.subdomain}/hotel`} />
        <Button label="Store" href={`/${org.subdomain}/store`} />
        <Button label="Volunteer" href={`/${org.subdomain}/volunteer`} />
        <Button label="Vendor apply" href={`/${org.subdomain}/vendor-apply`} />
      </div>
    </main>
  );
}
