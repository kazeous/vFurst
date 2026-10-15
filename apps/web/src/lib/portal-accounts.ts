import {
  createHashedOpaqueToken,
  hashOpaqueToken,
  hashPassword,
  normalizeIdentityEmail,
  verifyPassword
} from "@vfurst/auth/core";
import { prisma, type Organization, type PortalAccountTokenPurpose, type Prisma } from "@vfurst/db";
import { sendOrgEmail } from "@/lib/email";
import type { PortalAccountSummary } from "@/lib/portal-session";
import { getPortalUrl } from "@/lib/portal-url";
import { safeReturnTo } from "@/lib/return-to";

export const PORTAL_ACCOUNT_TOKEN_TTL_MS = 3_600_000;

export type PortalAccountOrganization = Pick<
  Organization,
  "id" | "name" | "subdomain" | "customDomain" | "customDomainStatus" | "contactEmail" | "emailProvider" | "emailSettings"
>;

type AccountEmailTemplate = "portal-account-setup" | "portal-password-reset" | "portal-account-exists";
type AccountRequest = { org: PortalAccountOrganization; email: string; returnTo: string; now?: Date };
type AccountWithVersion = PortalAccountSummary & { authVersion: number };
let dummyPasswordHash: Promise<string> | undefined;

export async function findOrCreatePortalAccount(
  client: Pick<Prisma.TransactionClient, "portalAccount">,
  input: { orgId: string; email: string; name: string | null }
): Promise<PortalAccountSummary> {
  const email = normalizeIdentityEmail(input.email);
  const account = await client.portalAccount.upsert({
    where: { orgId_email: { orgId: input.orgId, email } },
    update: {},
    create: { orgId: input.orgId, email, name: input.name },
    select: { id: true, orgId: true, email: true, name: true }
  });

  const name = input.name?.trim();
  if (account.name !== null || !name) return account;

  return client.portalAccount.update({
    where: { id: account.id },
    data: { name },
    select: { id: true, orgId: true, email: true, name: true }
  });
}

async function sendAccountEmail(
  org: PortalAccountOrganization,
  email: string,
  template: AccountEmailTemplate,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await sendOrgEmail(org, normalizeIdentityEmail(email), template, { organizationName: org.name, ...data });
  } catch {
    console.error({ orgId: org.id, template });
  }
}

async function issueAccountToken(input: AccountRequest & {
  portalAccountId: string;
  purpose: PortalAccountTokenPurpose;
}): Promise<void> {
  const now = input.now ?? new Date();
  const { token, tokenHash } = createHashedOpaqueToken();
  await prisma.$transaction(async (tx) => {
    // Lock the account before any token write, as password setting does below.
    // This also serializes issuance when there are no existing token rows.
    await tx.$queryRaw`SELECT id FROM portal_accounts WHERE id = ${input.portalAccountId}::uuid FOR UPDATE`;
    await tx.portalAccountToken.updateMany({
      where: { portalAccountId: input.portalAccountId, purpose: input.purpose, consumedAt: null },
      data: { consumedAt: now }
    });
    await tx.portalAccountToken.create({
      data: {
        orgId: input.org.id,
        portalAccountId: input.portalAccountId,
        purpose: input.purpose,
        tokenHash,
        expiresAt: new Date(now.getTime() + PORTAL_ACCOUNT_TOKEN_TTL_MS)
      }
    });
  });

  const url = getPortalUrl(
    input.org,
    `/set-password?token=${token}&returnTo=${encodeURIComponent(safeReturnTo(input.returnTo, "/"))}`
  );
  if (input.purpose === "ACCOUNT_SETUP") {
    await sendAccountEmail(input.org, input.email, "portal-account-setup", { setupUrl: url });
  } else {
    await sendAccountEmail(input.org, input.email, "portal-password-reset", { resetUrl: url });
  }
}

export async function requestPortalAccountSetup(input: AccountRequest): Promise<void> {
  const email = normalizeIdentityEmail(input.email);
  const account = await prisma.portalAccount.upsert({
    where: { orgId_email: { orgId: input.org.id, email } },
    create: { orgId: input.org.id, email },
    update: {}
  });

  if (account.passwordHash === null) {
    await issueAccountToken({ ...input, email, portalAccountId: account.id, purpose: "ACCOUNT_SETUP" });
    return;
  }

  await sendAccountEmail(input.org, email, "portal-account-exists", {
    signInUrl: getPortalUrl(input.org, `/login?returnTo=${encodeURIComponent(safeReturnTo(input.returnTo, "/"))}`),
    resetUrl: getPortalUrl(input.org, "/forgot-password")
  });
}

export async function requestPortalPasswordReset(input: AccountRequest): Promise<void> {
  const email = normalizeIdentityEmail(input.email);
  const account = await prisma.portalAccount.findUnique({
    where: { orgId_email: { orgId: input.org.id, email } }
  });
  if (!account) return;

  await issueAccountToken({
    ...input,
    email,
    portalAccountId: account.id,
    purpose: account.passwordHash === null ? "ACCOUNT_SETUP" : "PASSWORD_RESET"
  });
}

export async function findUsablePortalAccountToken(input: {
  token: string;
  orgId: string;
  now?: Date;
}): Promise<{ purpose: "ACCOUNT_SETUP" | "PASSWORD_RESET"; account: { id: string; email: string; name: string | null } } | null> {
  const now = input.now ?? new Date();
  const token = await prisma.portalAccountToken.findUnique({
    where: { tokenHash: hashOpaqueToken(input.token) },
    include: { portalAccount: { select: { id: true, email: true, name: true } } }
  });
  if (!token || token.consumedAt !== null || token.expiresAt <= now || token.orgId !== input.orgId) return null;

  const { id, email, name } = token.portalAccount;
  return { purpose: token.purpose, account: { id, email, name } };
}

export async function setPortalAccountPassword(input: {
  token: string;
  orgId: string;
  name: string;
  password: string;
  now?: Date;
}): Promise<AccountWithVersion | null> {
  const now = input.now ?? new Date();
  const tokenHash = hashOpaqueToken(input.token);
  const isUsable = (token: { consumedAt: Date | null; expiresAt: Date; orgId: string } | null) =>
    token !== null && token.consumedAt === null && token.expiresAt > now && token.orgId === input.orgId;

  // Reject unusable links with one indexed read before spending bcrypt work.
  if (!isUsable(await prisma.portalAccountToken.findUnique({ where: { tokenHash } }))) return null;
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const token = await tx.portalAccountToken.findUnique({ where: { tokenHash } });
    if (!token || !isUsable(token)) return null;

    // Keep the account-before-token write order shared with issuance. The guard
    // rechecks consumption after waiting for an issuer or another password write.
    await tx.$queryRaw`SELECT id FROM portal_accounts WHERE id = ${token.portalAccountId}::uuid FOR UPDATE`;
    const consumed = await tx.portalAccountToken.updateMany({
      where: { id: token.id, consumedAt: null },
      data: { consumedAt: now }
    });
    if (consumed.count !== 1) return null;

    const account = await tx.portalAccount.update({
      where: { id: token.portalAccountId },
      data: { passwordHash, emailVerifiedAt: now, name: input.name.trim(), authVersion: { increment: 1 } },
      select: { id: true, orgId: true, email: true, name: true, authVersion: true }
    });
    await tx.portalAccountToken.updateMany({
      where: { portalAccountId: token.portalAccountId, consumedAt: null },
      data: { consumedAt: now }
    });
    await tx.portalSession.updateMany({
      where: { portalAccountId: token.portalAccountId, revokedAt: null },
      data: { revokedAt: now }
    });
    return account;
  });
}

export async function authenticatePortalAccount(input: {
  orgId: string;
  email: string;
  password: string;
}): Promise<AccountWithVersion | null> {
  const account = await prisma.portalAccount.findUnique({
    where: { orgId_email: { orgId: input.orgId, email: normalizeIdentityEmail(input.email) } }
  });

  if (!account?.passwordHash) {
    dummyPasswordHash ??= hashPassword("vfurst-portal-timing-equalizer");
    await verifyPassword(input.password, await dummyPasswordHash);
    return null;
  }
  if (!await verifyPassword(input.password, account.passwordHash)) return null;

  const { id, orgId, email, name, authVersion } = account;
  return { id, orgId, email, name, authVersion };
}
