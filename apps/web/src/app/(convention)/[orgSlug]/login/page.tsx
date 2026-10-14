import Link from "next/link";
import { portalSignOut } from "@/actions/portal-auth-actions";
import { Button } from "@/components/ui/button";
import { getPortalAccount } from "@/lib/portal-account";
import { resolvePortalAuthPage } from "@/lib/portal-auth-page";
import { safeReturnTo } from "@/lib/return-to";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function PortalLoginPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const org = await resolvePortalAuthPage(orgSlug, "/login", query);
  const account = await getPortalAccount(org);
  const returnTo = safeReturnTo(query.returnTo, "/");

  return (
    <main className="vf-public-page">
      <section className="vf-section vf-stack">
        <h1>Sign in</h1>
        {account ? (
          <>
            <p>Signed in as {account.email}</p>
            <form action={portalSignOut}>
              <Button type="submit">Sign out</Button>
            </form>
          </>
        ) : (
          <>
            <LoginForm returnTo={returnTo} />
            <div className="vf-actions">
              <Link href={`/signup?returnTo=${encodeURIComponent(returnTo)}`}>Create account</Link>
              <Link href="/forgot-password">Forgot password?</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
