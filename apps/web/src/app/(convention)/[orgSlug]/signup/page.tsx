import { resolvePortalAuthPage } from "@/lib/portal-auth-page";
import { safeReturnTo } from "@/lib/return-to";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default async function PortalSignupPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  await resolvePortalAuthPage(orgSlug, "/signup", query);

  return (
    <main className="vf-public-page">
      <section className="vf-section vf-stack">
        <h1>Create account</h1>
        <SignupForm returnTo={safeReturnTo(query.returnTo, "/")} />
      </section>
    </main>
  );
}
