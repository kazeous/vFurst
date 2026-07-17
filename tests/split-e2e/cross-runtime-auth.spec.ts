import { expect, request, test } from "@playwright/test";
import {
  AUTH_COOKIE_NAMES,
  TENANT_SESSION_AUDIENCE,
  verifyTenantSession
} from "@vfurst/auth";
import { prisma } from "@vfurst/db";

const managerOrigin = "http://manager.localhost:3100";
const consoleOrigin = "http://console.localhost:3100";

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required by the split E2E test.`);
  return value;
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("central login creates an isolated tenant session and logout revokes it", async ({
  page,
  context
}) => {
  const email = requiredEnvironment("VFURST_SPLIT_E2E_USER_EMAIL");
  const password = requiredEnvironment("VFURST_SPLIT_E2E_USER_PASSWORD");
  const userId = requiredEnvironment("VFURST_SPLIT_E2E_USER_ID");
  const tenantSessionSecret = Buffer.from(
    requiredEnvironment("VFURST_TENANT_SESSION_SECRET_BASE64URL"),
    "base64url"
  );
  let capturedCallback = "";

  page.on("request", (requestEvent) => {
    if (requestEvent.url().startsWith(`${consoleOrigin}/auth/callback?`)) {
      capturedCallback = requestEvent.url();
    }
  });

  await page.goto(`${consoleOrigin}/auth/start?returnTo=/`);
  await expect(page).toHaveURL(new RegExp(`^${managerOrigin.replaceAll(".", "\\.")}/login\\?`));
  const transactionCookie = (await context.cookies(consoleOrigin)).find(
    (cookie) => cookie.name === AUTH_COOKIE_NAMES.tenantTransaction
  );
  expect(transactionCookie, "tenant transaction cookie should survive until callback").toBeDefined();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(`${consoleOrigin}/`);
  expect(capturedCallback).toContain(`${consoleOrigin}/auth/callback?`);

  const detachedRequest = await request.newContext({
    extraHTTPHeaders: {
      cookie: `${AUTH_COOKIE_NAMES.tenantTransaction}=${transactionCookie!.value}`
    }
  });
  try {
    const managerCookies = await context.cookies(managerOrigin);
    const consoleCookies = await context.cookies(consoleOrigin);
    const managerCookie = managerCookies.find(
      (cookie) => cookie.name === AUTH_COOKIE_NAMES.managerSession
    );
    const tenantCookie = consoleCookies.find(
      (cookie) => cookie.name === AUTH_COOKIE_NAMES.tenantSession
    );

    expect(managerCookie).toMatchObject({ domain: "manager.localhost", path: "/", secure: true });
    expect(tenantCookie).toMatchObject({ domain: "console.localhost", path: "/", secure: true });
    expect(managerCookies.map((cookie) => cookie.name)).not.toContain(AUTH_COOKIE_NAMES.tenantSession);
    expect(consoleCookies.map((cookie) => cookie.name)).not.toContain(AUTH_COOKIE_NAMES.managerSession);
    expect(consoleCookies.map((cookie) => cookie.name)).not.toContain(AUTH_COOKIE_NAMES.tenantTransaction);

    const claims = verifyTenantSession(tenantCookie!.value, {
      secret: tenantSessionSecret,
      audience: TENANT_SESSION_AUDIENCE
    });
    expect(claims.userId).toBe(userId);

    const storedSession = await prisma.session.findUnique({
      where: { id: claims.identitySessionId },
      select: {
        id: true,
        userId: true,
        authVersion: true,
        revokedAt: true,
        expires: true
      }
    });
    expect(storedSession).toMatchObject({
      id: claims.identitySessionId,
      userId,
      authVersion: claims.authVersion,
      revokedAt: null
    });
    expect(storedSession!.expires.getTime()).toBeGreaterThan(Date.now());

    const replay = await detachedRequest.get(capturedCallback, { maxRedirects: 0 });
    expect(replay.status()).toBe(502);
    await expect(replay.json()).resolves.toEqual({ error: "identity_exchange_failed" });

    const logoutStatus = await page.evaluate(async () => {
      const response = await fetch("/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
      return response.status;
    });
    expect(logoutStatus).toBe(204);
    expect((await context.cookies(consoleOrigin)).map((cookie) => cookie.name)).not.toContain(
      AUTH_COOKIE_NAMES.tenantSession
    );

    await expect
      .poll(async () => {
        const session = await prisma.session.findUnique({
          where: { id: claims.identitySessionId },
          select: { revokedAt: true }
        });
        return session?.revokedAt?.getTime() ?? null;
      })
      .not.toBeNull();

    await page.goto(`${consoleOrigin}/auth/start?returnTo=/`);
    await expect(page).toHaveURL(new RegExp(`^${managerOrigin.replaceAll(".", "\\.")}/login\\?`));
  } finally {
    await detachedRequest.dispose();
  }
});
