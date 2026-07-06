import { signIn } from "@/lib/auth";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import Link from "next/link";

export default function LoginPage() {
  async function loginWithCredentials(formData: FormData) {
    "use server";

    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard"
    });
  }

  async function loginWithGoogle() {
    "use server";

    await signIn("google", {
      redirectTo: "/dashboard"
    });
  }

  return (
    <Card className="vf-auth-card" maxWidth={440}>
      <div className="vf-stack">
        <div>
          <p className="vf-label">Welcome back</p>
          <h1>Log in to vFurst</h1>
        </div>
        <form action={loginWithCredentials} className="vf-form">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <Button label="Log in" type="submit" variant="primary" />
        </form>
        <div className="vf-divider">or</div>
        <form action={loginWithGoogle}>
          <Button label="Continue with Google" type="submit" />
        </form>
        <p className="vf-muted">
          New to vFurst? <Link href="/register">Create an account</Link>
        </p>
      </div>
    </Card>
  );
}

