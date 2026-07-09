import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Divider } from "@/components/ui/separator";
import Link from "next/link";
import { LoginForm } from "./login-form";

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
        <LoginForm action={loginWithCredentials} />
        <Divider label="or" />
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
