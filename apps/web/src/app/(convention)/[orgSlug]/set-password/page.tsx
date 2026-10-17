import { findUsablePortalAccountToken } from "@/lib/portal-accounts";
import { resolvePortalAuthPage } from "@/lib/portal-auth-page";
import { safeReturnTo } from "@/lib/return-to";
import { SetPasswordForm } from "./set-password-form";

export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer" };

export default async function PortalSetPasswordPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  const org = await resolvePortalAuthPage(orgSlug, "/set-password", query);
  const token = (Array.isArray(query.token) ? query.token[0] : query.token) ?? "";
  const usableToken = await findUsablePortalAccountToken({ orgId: org.id, token });

  return (
    <main className="vf-public-page">
      <section className="vf-section vf-stack">
        {/* Keep the action owner mounted when the cookie refresh sees the consumed token. */}
        <SetPasswordForm
          token={token}
          returnTo={safeReturnTo(query.returnTo, "/")}
          name={usableToken?.account.name ?? ""}
          heading={usableToken ? (usableToken.purpose === "ACCOUNT_SETUP" ? "Create your account" : "Choose a new password") : null}
        />
      </section>
    </main>
  );
}
