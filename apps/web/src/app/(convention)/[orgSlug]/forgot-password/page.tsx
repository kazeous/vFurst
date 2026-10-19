import { resolvePortalAuthPage } from "@/lib/portal-auth-page";
import { ForgotPasswordForm } from "./forgot-password-form";

export const dynamic = "force-dynamic";

export default async function PortalForgotPasswordPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ orgSlug }, query] = await Promise.all([params, searchParams]);
  await resolvePortalAuthPage(orgSlug, "/forgot-password", query);

  return (
    <main className="vf-public-page">
      <section className="vf-section vf-stack">
        <h1>Forgot password?</h1>
        <ForgotPasswordForm />
      </section>
    </main>
  );
}
