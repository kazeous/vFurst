import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();
const runId = `${Date.now()}-${process.pid}`;
const slugA = `portal-a-${runId}`;
const slugB = `portal-b-${runId}`;
const hostA = `${slugA}.localhost`;
const hostB = `${slugB}.localhost`;
const originA = `http://${hostA}:3000`;
const originB = `http://${hostB}:3000`;
const organizationName = `Portal Auth A ${runId}`;
const email = `user-${runId}@example.com`;
const walkinEmail = `walkin-${runId}@example.com`;
const password = "PortalAuthInitial123!";
const newPassword = "PortalAuthChanged123!";
const sentMessage = "Check your email. If this address can be used here, we sent a link that expires in one hour.";
const invalidLinkMessage = "This link is invalid, expired, or has already been used.";
const mailpitUrl = "http://127.0.0.1:8025/api/v1";

type MailpitMessage = {
  ID: string;
  Subject: string;
  To: Array<{ Address: string }>;
};

type MailpitMessageDetail = MailpitMessage & { HTML: string; Text: string };

test.setTimeout(120_000);
test.use({ serviceWorkers: "block" });

async function recipientMail(recipient: string): Promise<MailpitMessage[]> {
  const response = await fetch(`${mailpitUrl}/messages`);
  expect(response.ok).toBe(true);
  const body = (await response.json()) as { messages?: MailpitMessage[] };
  return body.messages?.filter((message) => message.To.some((entry) => entry.Address === recipient)) ?? [];
}

async function deliveredMail(recipient: string, subject: string): Promise<MailpitMessageDetail> {
  await expect.poll(async () => (await recipientMail(recipient)).some((message) => message.Subject === subject), {
    timeout: 20_000
  }).toBe(true);
  const message = (await recipientMail(recipient)).find((entry) => entry.Subject === subject);
  if (!message) throw new Error("Portal account email was not delivered to Mailpit.");
  const response = await fetch(`${mailpitUrl}/message/${message.ID}`);
  expect(response.ok).toBe(true);
  return (await response.json()) as MailpitMessageDetail;
}

function setPasswordLink(message: MailpitMessageDetail): string {
  const link = message.Text.match(/https?:\/\/[^\s]+/)?.[0];
  expect(link).toBeTruthy();
  const url = new URL(link!);
  expect(url.origin).toBe(originA);
  expect(url.pathname).toBe("/set-password");
  expect(url.searchParams.get("token")).toBeTruthy();
  return url.toString();
}

async function submit(page: Page, buttonName: string, navigates = false): Promise<void> {
  const pathname = new URL(page.url()).pathname;
  const response = page.waitForResponse((entry) =>
    entry.request().method() === "POST" && new URL(entry.url()).pathname === pathname
  );
  // Cookie refresh can show the next form before location.replace loads it.
  const documentLoaded = navigates ? page.waitForEvent("load") : Promise.resolve();
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  expect((await response).status()).toBeLessThan(400);
  await documentLoaded;
}

async function signup(page: Page, recipient: string): Promise<void> {
  await page.goto(`${originA}/signup?returnTo=%2Flogin`);
  await page.getByLabel("Email", { exact: true }).fill(recipient);
  await submit(page, "Create account");
  await expect(page.getByRole("status").filter({ hasText: sentMessage })).toHaveText(sentMessage);
}

async function signIn(page: Page, origin: string, attemptedPassword: string, succeeds = false): Promise<void> {
  await page.goto(`${origin}/login?returnTo=%2Flogin`);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(attemptedPassword);
  await submit(page, "Sign in", succeeds);
}

async function savePassword(page: Page, value: string): Promise<void> {
  await page.getByLabel("Name", { exact: true }).fill("Portal Auth Attendee");
  await page.getByLabel("New password", { exact: true }).fill(value);
  await page.getByLabel("Confirm password", { exact: true }).fill(value);
  await submit(page, "Save password", true);
}

test.describe.serial("portal auth", () => {
  const orgIds: string[] = [];
  let context: BrowserContext | undefined;
  let page: Page;
  let walkinSetupLink: string;

  test.beforeAll(async ({ browser }) => {
    for (const [slug, name] of [[slugA, organizationName], [slugB, `Portal Auth B ${runId}`]]) {
      const org = await prisma.organization.create({
        data: { name, slug, subdomain: slug, status: "ACTIVE", contactEmail: `contact-${slug}@example.com` }
      });
      orgIds.push(org.id);
    }
    await prisma.portalAccount.create({ data: { orgId: orgIds[0], email: walkinEmail } });
    context = await browser.newContext({ serviceWorkers: "block" });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    try {
      const where = { orgId: { in: orgIds } };
      let sessions = 0;
      let tokens = 0;
      try {
        [sessions, tokens] = await Promise.all([
          prisma.portalSession.count({ where }),
          prisma.portalAccountToken.count({ where })
        ]);
      } finally {
        try {
          await prisma.emailDelivery.deleteMany({ where: { recipient: { in: [email, walkinEmail] } } });
        } finally {
          // Delete organizations directly: sessions/tokens must cascade through their accounts.
          await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
          expect(await prisma.portalAccount.count({ where })).toBe(0);
          expect(await prisma.portalSession.count({ where })).toBe(0);
          expect(await prisma.portalAccountToken.count({ where })).toBe(0);
        }
      }
      expect(sessions, "Organization deletion must exercise existing portal sessions").toBeGreaterThan(0);
      expect(tokens, "Organization deletion must exercise existing portal tokens").toBeGreaterThan(0);
    } finally {
      try {
        await context?.close();
      } finally {
        await prisma.$disconnect();
      }
    }
  });

  test("email-first setup delivers a tenant link and stores only its token hash", async () => {
    await signup(page, email);
    const message = await deliveredMail(email, `Finish creating your ${organizationName} account`);
    const setupLink = setPasswordLink(message);
    const rawToken = new URL(setupLink).searchParams.get("token")!;
    const account = await prisma.portalAccount.findUniqueOrThrow({ where: { orgId_email: { orgId: orgIds[0], email } } });
    expect(account.passwordHash).toBeNull();
    expect(account.emailVerifiedAt).toBeNull();
    const storedToken = await prisma.portalAccountToken.findFirstOrThrow({
      where: { orgId: orgIds[0], portalAccountId: account.id, purpose: "ACCOUNT_SETUP" }
    });
    expect(storedToken.tokenHash).toBe(createHash("sha256").update(rawToken).digest("hex"));
    expect(storedToken.tokenHash).not.toBe(rawToken);

    await page.goto(setupLink);
    await savePassword(page, password);
    await expect(page).toHaveURL(`${originA}/login`, { timeout: 30_000 });
    await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
    const claimed = await prisma.portalAccount.findUniqueOrThrow({ where: { id: account.id } });
    expect(claimed.passwordHash).not.toBeNull();
    expect(claimed.emailVerifiedAt).not.toBeNull();
  });

  test("existing account signup keeps the same alert and sends an account-exists notice", async () => {
    await signup(page, email);
    await deliveredMail(email, `You already have a ${organizationName} account`);
  });

  test("sign-out and sign-in show an inline wrong-password error and allow retry", async () => {
    await page.goto(`${originA}/login`);
    await submit(page, "Sign out", true);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await signIn(page, originA, "PortalAuthWrong123!");
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect." })).toHaveText("Email or password is incorrect.");
    await signIn(page, originA, password, true);
    await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
  });

  test("session cookie is HttpOnly, SameSite Lax, and host-only", async () => {
    const cookie = (await context!.cookies(originA)).find((entry) => entry.name === "vfurst-portal");
    expect(cookie).toBeDefined();
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", domain: hostA, path: "/", secure: false });
    expect(cookie!.domain.startsWith(".")).toBe(false);
  });

  test("a copied session cookie and A credentials do not authenticate on B", async () => {
    const cookie = (await context!.cookies(originA)).find((entry) => entry.name === "vfurst-portal");
    expect(cookie).toBeDefined();
    await context!.addCookies([{ ...cookie!, domain: hostB }]);
    await page.goto(`${originB}/login`);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toHaveCount(0);
    await signIn(page, originB, password);
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect." })).toHaveText("Email or password is incorrect.");
    expect(await prisma.portalAccount.count({ where: { orgId: orgIds[1], email } })).toBe(0);
  });

  test("password reset replaces the password and rejects replay of the delivered link", async () => {
    await page.goto(`${originA}/forgot-password`);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await submit(page, "Send link");
    await expect(page.getByRole("status").filter({ hasText: sentMessage })).toHaveText(sentMessage);
    const message = await deliveredMail(email, `Reset your ${organizationName} account password`);
    const resetLink = setPasswordLink(message);
    await page.goto(resetLink);
    await savePassword(page, newPassword);
    await expect(page).toHaveURL(`${originA}/`, { timeout: 30_000 });
    await page.goto(`${originA}/login`);
    await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
    await submit(page, "Sign out", true);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
    await signIn(page, originA, password);
    await expect(page.getByRole("alert").filter({ hasText: "Email or password is incorrect." })).toHaveText("Email or password is incorrect.");
    await signIn(page, originA, newPassword, true);
    await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
    await page.goto(resetLink);
    await expect(page.getByRole("alert").filter({ hasText: invalidLinkMessage })).toHaveText(invalidLinkMessage);
    await expect(page.getByRole("button", { name: "Save password", exact: true })).toHaveCount(0);
  });

  test("an unclaimed walk-in receives setup mail rather than an account-exists notice", async () => {
    await signup(page, walkinEmail);
    const message = await deliveredMail(walkinEmail, `Finish creating your ${organizationName} account`);
    walkinSetupLink = setPasswordLink(message);
    expect((await recipientMail(walkinEmail)).some((entry) =>
      entry.Subject === `You already have a ${organizationName} account`
    )).toBe(false);
    const account = await prisma.portalAccount.findUniqueOrThrow({
      where: { orgId_email: { orgId: orgIds[0], email: walkinEmail } }
    });
    expect(account.passwordHash).toBeNull();
  });

  test("the delivered set-password link response sends no-referrer", async () => {
    const response = await page.goto(walkinSetupLink);
    expect(response).not.toBeNull();
    expect(response!.status()).toBe(200);
    expect(response!.headers()["referrer-policy"]).toBe("no-referrer");
    await expect(page.getByRole("button", { name: "Save password", exact: true })).toBeVisible();
  });

  test("central-path login redirects to A without a central portal cookie", async () => {
    await page.goto(`http://localhost:3000/${slugA}/login`);
    await expect(page).toHaveURL(`${originA}/login`);
    await expect(page.getByText(`Signed in as ${email}`, { exact: true })).toBeVisible();
    expect((await context!.cookies("http://localhost:3000")).some((cookie) => cookie.name === "vfurst-portal")).toBe(false);
  });
});
