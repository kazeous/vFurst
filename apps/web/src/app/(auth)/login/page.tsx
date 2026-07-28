import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Divider } from "@/components/ui/separator";
import { AuthError } from "next-auth";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { safeReturnTo } from "@/lib/return-to";
import { LoginForm, type LoginFormState } from "./login-form";
import { Alert } from "@/components/ui/alert";

const errorMessages: Record<string, string> = {
  invalid_credentials: "The email or password was not accepted."
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string; error?: string; returnTo?: string | string[] }> }) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo);
  const errorMessage = query.error ? errorMessages[query.error] : undefined;

  async function loginWithCredentials(
    _previousState: LoginFormState,
    formData: FormData
  ): Promise<LoginFormState> {
    "use server";

    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: returnTo
      });
      return {};
    } catch (error) {
      unstable_rethrow(error);

      if (error instanceof AuthError) {
        return { error: errorMessages.invalid_credentials };
      }

      throw error;
    }
  }

  async function loginWithGoogle() {
    "use server";

    await signIn("google", {
      redirectTo: returnTo
    });
  }

  return (
    <Card className="vf-auth-card" maxWidth={440}>
      <div className="vf-stack">
        <div>
          <p className="vf-label">Welcome back</p>
          <h1>Log in to vFurst</h1>
        </div>
        {errorMessage ? (
          <Alert variant="error" data-testid="login-error">
            {errorMessage}
          </Alert>
        ) : null}
        <LoginForm action={loginWithCredentials} />
        {query.reset ? <Alert variant="success">Password updated. You can log in now.</Alert> : null}
        <p className="vf-muted"><Link href={`/forgot-password?returnTo=${encodeURIComponent(returnTo)}`}>Forgot your password?</Link></p>
        <Divider label="or" />
        <form action={loginWithGoogle}>
          <Button label="Continue with Google" type="submit" />
        </form>
        <p className="vf-muted">
          New to vFurst? <Link href={`/register?returnTo=${encodeURIComponent(returnTo)}`}>Create an account</Link>
        </p>
      </div>
    </Card>
  );
}
