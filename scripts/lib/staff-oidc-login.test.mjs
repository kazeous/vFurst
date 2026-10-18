import assert from "node:assert/strict";
import { test } from "node:test";
import { loginStaffThroughMockOidc } from "./staff-oidc-login.mjs";

const baseUrl = "http://localhost:3000";
const authorizeUrl = "http://localhost:8090/vfurst/authorize?client_id=vfurst-local&state=s1&code_challenge=c1";
const callbackUrl = "http://localhost:3000/api/auth/callback/authentik?code=code-1&state=s1";

function scriptedFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    assert.ok(next, `unexpected request to ${url}`);
    return next;
  };
  return { calls, fetchImpl };
}

function redirect(location, cookies = []) {
  return new Response(null, {
    status: 302,
    headers: [["location", location], ...cookies.map((cookie) => ["set-cookie", cookie])]
  });
}

function csrfResponse() {
  return new Response(JSON.stringify({ csrfToken: "csrf-1" }), {
    status: 200,
    headers: [
      ["content-type", "application/json"],
      ["set-cookie", "authjs.csrf-token=csrf-cookie; Path=/; HttpOnly; SameSite=Lax"],
      ["set-cookie", "authjs.callback-url=http%3A%2F%2Flocalhost%3A3000; Path=/; HttpOnly; SameSite=Lax"]
    ]
  });
}

function cookieHeaderOf(call) {
  return new Headers(call.init.headers).get("cookie") ?? "";
}

test("forwards csrf, pkce, and state cookies and returns the session cookie", async () => {
  const { calls, fetchImpl } = scriptedFetch([
    csrfResponse(),
    redirect(authorizeUrl, [
      "authjs.pkce.code_verifier=verifier-1; Path=/; HttpOnly; SameSite=Lax",
      "authjs.state=state-cookie-1; Path=/; HttpOnly; SameSite=Lax"
    ]),
    redirect(callbackUrl),
    redirect("http://localhost:3000/dashboard", [
      "authjs.pkce.code_verifier=; Max-Age=0; Path=/",
      "authjs.state=; Max-Age=0; Path=/",
      "vfurst-staff=session-1; Path=/; HttpOnly; SameSite=Lax"
    ])
  ]);

  const cookie = await loginStaffThroughMockOidc({
    baseUrl,
    sub: "load-admin-acme",
    email: "load-admin@example.com",
    groups: ["vfurst-platform-admins"],
    fetchImpl
  });

  assert.equal(cookie, "vfurst-staff=session-1");
  assert.equal(calls.length, 4);

  assert.equal(calls[0].url, `${baseUrl}/api/auth/csrf`);

  assert.equal(calls[1].url, `${baseUrl}/api/auth/signin/authentik`);
  assert.equal(calls[1].init.method, "POST");
  assert.equal(calls[1].init.redirect, "manual");
  assert.match(cookieHeaderOf(calls[1]), /(^|; )authjs\.csrf-token=csrf-cookie(;|$)/);
  const signInForm = new URLSearchParams(String(calls[1].init.body));
  assert.equal(signInForm.get("csrfToken"), "csrf-1");
  assert.equal(signInForm.get("callbackUrl"), `${baseUrl}/dashboard`);

  assert.equal(calls[2].url, authorizeUrl);
  assert.equal(calls[2].init.method, "POST");
  assert.equal(cookieHeaderOf(calls[2]), "");
  const authorizeForm = new URLSearchParams(String(calls[2].init.body));
  assert.equal(authorizeForm.get("username"), "load-admin-acme");
  const claims = JSON.parse(authorizeForm.get("claims") ?? "null");
  assert.deepEqual({ email: claims.email, email_verified: claims.email_verified, groups: claims.groups }, {
    email: "load-admin@example.com",
    email_verified: true,
    groups: ["vfurst-platform-admins"]
  });
  assert.equal(claims.auth_time, claims.vfurst_assurance.primary_at);
  assert.equal(claims.vfurst_assurance.mfa_at, claims.auth_time);

  assert.equal(calls[3].url, callbackUrl);
  assert.equal(calls[3].init.redirect, "manual");
  const callbackCookies = cookieHeaderOf(calls[3]);
  assert.match(callbackCookies, /(^|; )authjs\.pkce\.code_verifier=verifier-1(;|$)/);
  assert.match(callbackCookies, /(^|; )authjs\.state=state-cookie-1(;|$)/);
  assert.match(callbackCookies, /(^|; )authjs\.csrf-token=csrf-cookie(;|$)/);
});

test("throws naming the step when the callback sets no session cookie", async () => {
  const { fetchImpl } = scriptedFetch([
    csrfResponse(),
    redirect(authorizeUrl, ["authjs.state=state-cookie-1; Path=/"]),
    redirect(callbackUrl),
    redirect("http://localhost:3000/login?error=AccessDenied")
  ]);

  await assert.rejects(
    loginStaffThroughMockOidc({ baseUrl, sub: "load-admin-acme", email: "load-admin@example.com", fetchImpl }),
    /callback/
  );
});

test("renews the original staff binding with prompt=none and keeps primary authentication time", async () => {
  const { calls, fetchImpl } = scriptedFetch([
    csrfResponse(), redirect(authorizeUrl), redirect(callbackUrl),
    redirect("http://localhost:3000/dashboard", ["vfurst-staff=renewed; Path=/; HttpOnly"])
  ]);
  const cookie = await loginStaffThroughMockOidc({
    baseUrl: "http://127.0.0.1:3000", sub: "load-sub", email: "load@example.com", existingCookie: "vfurst-staff=original", authenticatedAt: 1234, fetchImpl
  });
  assert.equal(cookie, "vfurst-staff=renewed");
  assert.equal(calls[0].url, "http://localhost:3000/api/auth/csrf");
  assert.equal(new URL(calls[1].url).searchParams.get("vfurstPurpose"), "lease");
  assert.equal(new URL(calls[1].url).searchParams.get("prompt"), "none");
  assert.match(cookieHeaderOf(calls[1]), /vfurst-staff=original/);
  assert.equal(JSON.parse(new URLSearchParams(calls[2].init.body).get("claims")).auth_time, 1234);
});
