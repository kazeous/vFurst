import { safeLocalReturnPath } from "@vfurst/auth/core";
import { getPlatformManagerEnv } from "@/lib/env";
import { signInWithCredentials, signInWithGoogle } from "./actions";

type LoginPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo = safeLocalReturnPath(params.returnTo, "/");
  const showError = params.error === "invalid_credentials";
  const env = getPlatformManagerEnv();

  return (
    <main>
      <section className="shell-card login-card" aria-labelledby="login-heading">
        <p className="eyebrow">vFurst identity</p>
        <h1 id="login-heading">Sign in</h1>
        <p>Use your central vFurst account to continue.</p>
        {showError ? (
          <p className="form-error" role="alert" aria-live="polite">
            The email or password was not accepted.
          </p>
        ) : null}
        <form action={signInWithCredentials} className="login-form">
          <input type="hidden" name="returnTo" value={returnTo} />
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required />
          <button type="submit">Sign in</button>
        </form>
        {env.googleClientId ? (
          <form action={signInWithGoogle} className="login-form secondary-login">
            <input type="hidden" name="returnTo" value={returnTo} />
            <button type="submit" className="secondary-button">
              Continue with Google
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
