import { createHash } from "node:crypto";
import { Prisma, prisma, type StaffOidcTransaction } from "@vfurst/db";
import { issueIdentitySession, IDENTITY_SESSION_MAX_AGE_SECONDS } from "@/lib/identity-session";
import { STAFF_IDENTITY_PROVIDER, syncStaffUser, type StaffClaims } from "@/lib/staff-identity";
import { assertStaffStepUp, STAFF_IDP_LEASE_MS, STAFF_FLOW_MS, StaffIdentityError, type StaffAssurance } from "@/lib/staff-session-policy";

export type StaffOidcPurpose = "login" | "lease" | "step-up";

export async function staffIdentityTransaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt >= 2 || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error;
    }
  }
}
export function hashStaffProtocolValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function readStaffOidcTransaction(token: string | undefined, now = new Date()) {
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const transaction = await prisma.staffOidcTransaction.findUnique({ where: { tokenHash: hashStaffProtocolValue(token) } });
  return transaction && !transaction.consumedAt && transaction.expiresAt > now ? transaction : null;
}

/** Serializable reads fence both a late callback and a concurrent local/IdP logout. */
export async function completeStaffOidcTransaction(input: {
  transaction: StaffOidcTransaction;
  userId: string;
  claims: StaffClaims;
  assurance: StaffAssurance;
  issuer: string;
  clientId: string;
  idToken: string;
  now?: Date;
}) {
  return staffIdentityTransaction(async (tx) => {
    const now = input.now ?? new Date();
    const flow = input.transaction;
    const used = await tx.staffOidcTransaction.updateMany({
      where: { id: flow.id, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now }
    });
    if (used.count !== 1) throw new StaffIdentityError("SessionRevoked");
    const account = await tx.account.findUnique({
      where: { provider_providerAccountId: { provider: STAFF_IDENTITY_PROVIDER, providerAccountId: input.claims.sub } }
    });
    if (!account || account.userId !== input.userId) throw new StaffIdentityError("ActorChanged");
    const fences = await tx.staffOidcRevocation.findMany({
      where: {
        issuer: input.issuer, clientId: input.clientId, expiresAt: { gt: now },
        OR: [
          { kind: "sub", valueHash: hashStaffProtocolValue(input.claims.sub) },
          { kind: "local", valueHash: hashStaffProtocolValue(input.userId) },
          ...(input.claims.sid ? [
            { kind: "sid", valueHash: hashStaffProtocolValue(input.claims.sid) },
            { kind: "sid-sub", valueHash: hashStaffProtocolValue(JSON.stringify([input.claims.sub, input.claims.sid])) }
          ] : [])
        ]
      }
    });
    if (fences.some((fence) => fence.kind === "sid" || fence.kind === "sid-sub" ||
      (fence.kind === "local" ? flow.createdAt <= fence.revokedThrough : input.assurance.primaryAuthenticatedAt <= fence.revokedThrough))) {
      throw new StaffIdentityError("SessionRevoked");
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    let identitySessionId: string;
    if (flow.purpose === "lease" || flow.purpose === "step-up") {
      if (flow.userId !== user.id || flow.authVersion !== user.authVersion || !flow.sessionId) throw new StaffIdentityError("ActorChanged");
      const session = await tx.session.findUnique({ where: { id: flow.sessionId } });
      if (!session || session.userId !== user.id || session.authVersion !== user.authVersion || session.revokedAt ||
        session.expires <= now || !session.idleExpiresAt || session.idleExpiresAt <= now ||
        session.oidcIssuer !== input.issuer || session.oidcClientId !== input.clientId || session.oidcSubject !== input.claims.sub ||
        session.createdAt.getTime() + IDENTITY_SESSION_MAX_AGE_SECONDS * 1_000 <= now.getTime()) {
        throw new StaffIdentityError("SessionRevoked");
      }
      if (flow.purpose === "lease" && session.oidcSid !== input.claims.sid) throw new StaffIdentityError("ActorChanged");
      if (flow.purpose === "step-up") assertStaffStepUp(input.assurance, flow.createdAt, now);
      await tx.session.update({
        where: { id: session.id },
        data: {
          idpValidUntil: new Date(Math.min(session.expires.getTime(), flow.createdAt.getTime() + STAFF_IDP_LEASE_MS)),
          oidcSid: input.claims.sid, idToken: input.idToken, ...input.assurance
        }
      });
      identitySessionId = session.id;
    } else if (flow.purpose === "login") {
      const expires = new Date(now.getTime() + IDENTITY_SESSION_MAX_AGE_SECONDS * 1_000);
      const session = await issueIdentitySession({
        userId: user.id, authVersion: user.authVersion, expires, oidcSid: input.claims.sid,
        issuer: input.issuer, clientId: input.clientId, subject: input.claims.sub, idToken: input.idToken,
        idpValidUntil: new Date(Math.min(expires.getTime(), now.getTime() + STAFF_IDP_LEASE_MS)), assurance: input.assurance, now
      }, tx);
      identitySessionId = session.id;
    } else throw new StaffIdentityError("InvalidIdentity");
    await syncStaffUser(user.id, input.claims, now, tx);
    return { identitySessionId, userId: user.id, authVersion: user.authVersion };
  });
}

export async function createStaffLogoutFence(tx: Prisma.TransactionClient, input: {
  issuer: string; clientId: string; kind: "sid" | "sid-sub" | "sub" | "local"; value: string; revokedThrough: Date; now: Date;
}) {
  const key = { issuer: input.issuer, clientId: input.clientId, kind: input.kind, valueHash: hashStaffProtocolValue(input.value) };
  const existing = await tx.staffOidcRevocation.findUnique({ where: { issuer_clientId_kind_valueHash: key } });
  const revokedThrough = existing && existing.revokedThrough > input.revokedThrough ? existing.revokedThrough : input.revokedThrough;
  await tx.staffOidcRevocation.upsert({
    where: { issuer_clientId_kind_valueHash: key },
    create: { ...key, revokedThrough, expiresAt: new Date(input.now.getTime() + IDENTITY_SESSION_MAX_AGE_SECONDS * 1_000 + STAFF_FLOW_MS) },
    update: { revokedThrough, expiresAt: new Date(input.now.getTime() + IDENTITY_SESSION_MAX_AGE_SECONDS * 1_000 + STAFF_FLOW_MS) }
  });
}
