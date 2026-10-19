const SESSION_COOKIE_NAME = /^(?:__Host-)?vfurst-staff(?:\.\d+)?$/;

function storeCookies(jar, response) {
  for (const header of response.headers.getSetCookie()) {
    const [pair = ""] = header.split(";");
    const index = pair.indexOf("=");

    if (index < 1) {
      continue;
    }

    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();

    if (!value || /;\s*max-age=0(?:;|$)/i.test(header)) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

function cookieHeader(jar, filter = () => true) {
  return [...jar]
    .filter(([name]) => filter(name))
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function fail(step, detail) {
  return new Error(`Staff OIDC login failed at ${step}: ${detail}`);
}

function redirectLocation(step, response) {
  if (response.status !== 302 && response.status !== 303) {
    throw fail(step, `expected a redirect, got HTTP ${response.status}.`);
  }

  const location = response.headers.get("location");

  if (!location) {
    throw fail(step, "the redirect has no Location header.");
  }

  return location;
}

/**
 * Signs a staff user in through the local mock OIDC provider with plain HTTP and returns
 * a Cookie header carrying the Auth.js session cookie. The four hops mirror the browser:
 * csrf, Auth.js sign-in, the mock's interactive login form, and the Auth.js callback.
 */
export async function loginStaffThroughMockOidc({ baseUrl, sub, email, groups = [], existingCookie = "", authenticatedAt = Math.floor(Date.now() / 1_000), fetchImpl = fetch }) {
  const origin = baseUrl.replace(/\/+$/, "");
  const browserOrigin = new URL(origin);
  if (browserOrigin.hostname === "127.0.0.1") browserOrigin.hostname = "localhost";
  const jar = new Map();
  for (const pair of existingCookie.split(";")) {
    const index = pair.indexOf("=");
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }

  // Node's fetch can drop an explicit Host header. Connect to the canonical
  // local hostname so auth cookies and middleware see the same browser host.
  const authOrigin = browserOrigin.origin;
  const csrfResponse = await fetchImpl(`${authOrigin}/api/auth/csrf`, { redirect: "manual" });

  if (csrfResponse.status !== 200) {
    throw fail("csrf", `expected HTTP 200, got HTTP ${csrfResponse.status}.`);
  }

  storeCookies(jar, csrfResponse);
  const { csrfToken } = await csrfResponse.json();

  if (!csrfToken) {
    throw fail("csrf", "the response has no csrfToken.");
  }

  const signInPath = `/api/auth/signin/authentik${existingCookie ? "?vfurstPurpose=lease&prompt=none" : ""}`;
  const signInResponse = await fetchImpl(`${authOrigin}${signInPath}`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: authOrigin, cookie: cookieHeader(jar) },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${authOrigin}/dashboard` }).toString()
  });
  const authorizeUrl = redirectLocation("signin", signInResponse);
  storeCookies(jar, signInResponse);

  const authorizeResponse = await fetchImpl(authorizeUrl, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: sub,
      claims: JSON.stringify({ email, email_verified: true, groups,
        auth_time: authenticatedAt, amr: ["pwd", "mfa"],
        vfurst_assurance: { version: 1, policy: "vfurst-v1", primary_at: authenticatedAt, primary_method: "password", mfa_enrolled: true, mfa_at: authenticatedAt }
      })
    }).toString()
  });
  const callbackUrl = new URL(redirectLocation("authorize", authorizeResponse), authorizeUrl).toString();

  const callbackResponse = await fetchImpl(callbackUrl, {
    redirect: "manual",
    headers: { cookie: cookieHeader(jar) }
  });
  const destination = new URL(redirectLocation("callback", callbackResponse), browserOrigin);
  if (destination.pathname === "/login" || destination.searchParams.has("error")) throw fail("callback", "the identity was rejected.");
  storeCookies(jar, callbackResponse);

  const sessionCookie = cookieHeader(jar, (name) => SESSION_COOKIE_NAME.test(name));

  if (!sessionCookie) {
    throw fail("callback", "no staff session cookie was set.");
  }

  return sessionCookie;
}
