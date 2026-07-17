import {
  AUTH_COOKIE_NAMES,
  HOST_ONLY_SESSION_COOKIE_POLICY,
  HOST_ONLY_TRANSACTION_COOKIE_POLICY,
  TENANT_SESSION_AUDIENCE,
  TenantSessionError,
  consumeAuthorizationTransaction,
  mintTenantSession,
  startAuthorizationTransaction,
  verifyIdentityAssertion,
  verifyTenantSession
} from "@vfurst/auth";
import {
  authorizationCodeExchangeResponseSchema,
  authorizationCodeExchangeRequestSchema,
  identitySessionRevocationRequestSchema
} from "@vfurst/contracts";
import { normalizeHostname } from "@vfurst/tenant-context";
import { NextResponse, type NextRequest } from "next/server";
import { getTenantAuthRuntime } from "./auth-runtime";
import type { TenantWebEnvironment } from "./environment";

export const IDENTITY_SERVICE_TIMEOUT_MS = 5_000;

type Fetch = typeof fetch;

type HandoffDependencies = Readonly<{
  fetch?: Fetch;
  now?: Date;
}>;

function noStore(response: NextResponse) {
  response.headers.set("cache-control", "no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

function clearTransactionCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAMES.tenantTransaction, "", {
    ...HOST_ONLY_TRANSACTION_COOKIE_POLICY,
    expires: new Date(0),
    maxAge: 0
  });
  return response;
}

function clearTenantSessionCookie(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAMES.tenantSession, "", {
    ...HOST_ONLY_SESSION_COOKIE_POLICY,
    expires: new Date(0),
    maxAge: 0
  });
  return response;
}

function authFailure(status: number, code: string) {
  return noStore(NextResponse.json({ error: code }, { status }));
}

function requestHostname(request: NextRequest) {
  return normalizeHostname(request.headers.get("host") ?? "");
}

export function beginTenantAuthorization(
  request: NextRequest,
  environment: TenantWebEnvironment,
  now = new Date()
) {
  if (requestHostname(request) !== environment.consoleHostname) {
    return authFailure(421, "misdirected_request");
  }

  const runtime = getTenantAuthRuntime(environment);
  const transaction = startAuthorizationTransaction({
    encryptionKey: runtime.transactionKey,
    clientId: runtime.clientId,
    redirectUri: runtime.callbackUrl,
    returnTo: request.nextUrl.searchParams.get("returnTo") ?? undefined,
    now
  });
  const managerAuthorizeUrl = new URL("/api/identity/authorize", environment.managerUrl);
  managerAuthorizeUrl.searchParams.set("audience", transaction.authorization.audience);
  managerAuthorizeUrl.searchParams.set("clientId", transaction.authorization.clientId);
  managerAuthorizeUrl.searchParams.set("redirectUri", transaction.authorization.redirectUri);
  managerAuthorizeUrl.searchParams.set("state", transaction.authorization.state);
  managerAuthorizeUrl.searchParams.set("codeChallenge", transaction.authorization.codeChallenge);

  const response = noStore(NextResponse.redirect(managerAuthorizeUrl, 302));
  response.cookies.set(transaction.cookie.name, transaction.cookie.value, transaction.cookie.options);
  return response;
}

export async function completeTenantAuthorization(
  request: NextRequest,
  environment: TenantWebEnvironment,
  dependencies: HandoffDependencies = {}
) {
  const transactionNow = dependencies.now ?? new Date();
  let response: NextResponse;

  try {
    if (requestHostname(request) !== environment.consoleHostname) {
      response = authFailure(421, "misdirected_request");
      return clearTransactionCookie(response);
    }

    const runtime = getTenantAuthRuntime(environment);
    const state = request.nextUrl.searchParams.get("state");
    const code = request.nextUrl.searchParams.get("code");
    const transactionCookie = request.cookies.get(AUTH_COOKIE_NAMES.tenantTransaction)?.value;

    if (!state || !code || !transactionCookie || request.nextUrl.searchParams.has("error")) {
      response = authFailure(400, "authorization_failed");
      return clearTransactionCookie(response);
    }

    const transaction = consumeAuthorizationTransaction({
      encryptionKey: runtime.transactionKey,
      cookieValue: transactionCookie,
      state,
      now: transactionNow
    });
    const exchangeRequest = authorizationCodeExchangeRequestSchema.parse({
      audience: runtime.audience,
      clientId: runtime.clientId,
      code,
      codeVerifier: transaction.codeVerifier,
      redirectUri: transaction.redirectUri
    });
    const exchangeResponse = await (dependencies.fetch ?? fetch)(
      new URL("/api/identity/exchange", environment.managerUrl),
      {
        method: "POST",
        cache: "no-store",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${environment.identityServiceSecret}`,
          "content-type": "application/json"
        },
        body: JSON.stringify(exchangeRequest),
        signal: AbortSignal.timeout(IDENTITY_SERVICE_TIMEOUT_MS)
      }
    );

    if (!exchangeResponse.ok) {
      response = authFailure(502, "identity_exchange_failed");
      return clearTransactionCookie(response);
    }
    const exchange = authorizationCodeExchangeResponseSchema.parse(await exchangeResponse.json());
    // The manager issues the assertion after the network exchange begins. A
    // request-start timestamp can therefore predate its `iat` by a second and
    // incorrectly reject a fresh assertion. Tests may inject one fixed clock;
    // real requests take a fresh post-exchange timestamp here.
    const assertionNow = dependencies.now ?? new Date();
    const assertion = verifyIdentityAssertion(exchange.identityAssertion, {
      audience: runtime.audience,
      publicKeys: runtime.managerIdentityPublicKeys,
      now: assertionNow
    });
    const tenantSession = mintTenantSession({
      secret: runtime.tenantSessionSecret,
      audience: TENANT_SESSION_AUDIENCE,
      identitySessionId: assertion.sessionId,
      userId: assertion.userId,
      authVersion: assertion.authVersion,
      now: assertionNow
    });

    response = noStore(
      NextResponse.redirect(new URL(transaction.returnTo, environment.consoleUrl), 303)
    );
    response.cookies.set(AUTH_COOKIE_NAMES.tenantSession, tenantSession.token, {
      ...HOST_ONLY_SESSION_COOKIE_POLICY,
      maxAge: tenantSession.claims.expiresAt - tenantSession.claims.issuedAt,
      expires: new Date(tenantSession.claims.expiresAt * 1_000)
    });
    return clearTransactionCookie(response);
  } catch {
    response = authFailure(400, "authorization_failed");
    return clearTransactionCookie(response);
  }
}

export async function logoutTenantSession(
  request: NextRequest,
  environment: TenantWebEnvironment,
  dependencies: HandoffDependencies = {}
) {
  const response = clearTenantSessionCookie(noStore(new NextResponse(null, { status: 204 })));
  try {
    if (requestHostname(request) !== environment.consoleHostname) {
      return clearTenantSessionCookie(authFailure(421, "misdirected_request"));
    }
  } catch {
    return clearTenantSessionCookie(authFailure(400, "invalid_host"));
  }
  const token = request.cookies.get(AUTH_COOKIE_NAMES.tenantSession)?.value;
  if (!token) return response;

  try {
    const runtime = getTenantAuthRuntime(environment);
    const claims = verifyTenantSession(token, {
      secret: runtime.tenantSessionSecret,
      audience: TENANT_SESSION_AUDIENCE,
      now: dependencies.now
    });
    await (dependencies.fetch ?? fetch)(new URL("/api/identity/revoke", environment.managerUrl), {
      method: "POST",
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${environment.identityServiceSecret}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(identitySessionRevocationRequestSchema.parse({
        identitySessionId: claims.identitySessionId
      })),
      signal: AbortSignal.timeout(IDENTITY_SERVICE_TIMEOUT_MS)
    });
  } catch (error) {
    if (!(error instanceof TenantSessionError)) {
      // Revocation is deliberately best effort. The central expiry/authVersion
      // checks still invalidate this browser after the local cookie is cleared.
    }
  }

  return response;
}
