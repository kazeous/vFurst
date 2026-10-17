import { signIn } from "@/lib/auth";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { safeReturnTo } from "@/lib/return-to";

const errorMessages: Record<string, string> = {
  StudioAccountConflict:
    "This Reyuu Games account uses an email that already belongs to another vFurst staff account. Contact a platform administrator.",
  AccessDenied: "This Reyuu Games account could not be used to sign in."
};
const fallbackErrorMessage = "Sign-in did not complete. Try again.";

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string | string[]; returnTo?: string | string[] }>;
}) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);
  const errorCode = Array.isArray(query.error) ? query.error[0] : query.error;
  const errorMessage = errorCode ? (errorMessages[errorCode] ?? fallbackErrorMessage) : undefined;

  async function signInWithStudioAccount() {
    "use server";

    await signIn("authentik", { redirectTo: returnTo });
  }

  return (
    <Card className="vf-auth-card" maxWidth={440}>
      <div className="vf-stack">
        <div>
          <p className="vf-label">Welcome back</p>
          <h1>Sign in to vFurst</h1>
          <p className="vf-muted">Staff and organizers sign in with their Reyuu Games account.</p>
        </div>
        {errorMessage ? (
          <Alert variant="error" data-testid="login-error">
            {errorMessage}
          </Alert>
        ) : null}
        <form action={signInWithStudioAccount}>
          <Button label="Sign in with your Reyuu Games account" type="submit" variant="primary" />
        </form>
      </div>
    </Card>
  );
}
