import { getStaffSession, signIn } from "@/lib/auth";
import { safeReturnTo } from "@/lib/return-to";
import { getStaffAccountManagementUrl } from "@/lib/staff-oidc";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { redirect } from "next/navigation";

export default async function StaffVerificationPage({ searchParams }: { searchParams: Promise<{ returnTo?: string | string[] }> }) {
  const returnTo = safeReturnTo((await searchParams).returnTo);
  const session = await getStaffSession();
  if (!session?.user?.id) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  async function verify() {
    "use server";
    await signIn("authentik", { redirectTo: returnTo, purpose: "step-up" });
  }
  return <Card maxWidth={520}>
    <CardHeader>
      <CardTitle>Verify your Reyuu Games account</CardTitle>
      <CardDescription>Continue as {session.user.email}. Sensitive changes require a recent sign-in and a passkey or authenticator code.</CardDescription>
    </CardHeader>
    <CardContent className="vf-stack">
      <p>After verifying, return to your original tab and submit the form again.</p>
      <form action={verify}><Button type="submit" variant="primary" label="Verify your account" /></form>
      <Button href={getStaffAccountManagementUrl()} label="Manage your Reyuu Games account" />
    </CardContent>
  </Card>;
}
