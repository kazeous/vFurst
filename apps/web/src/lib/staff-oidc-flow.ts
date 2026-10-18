import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@vfurst/db";
import { getCentralAppUrl } from "@/lib/central-url";
import { safeReturnTo } from "@/lib/return-to";
import { hashStaffProtocolValue, readStaffOidcTransaction, type StaffOidcPurpose } from "@/lib/staff-oidc-store";
import { STAFF_FLOW_MS, StaffIdentityError } from "@/lib/staff-session-policy";
import { isPlatformHostname, normalizeHostname } from "@/lib/platform-hosts";

export function staffFlowCookieName() {
  return new URL(getCentralAppUrl()).protocol === "https:" ? "__Host-vfurst-staff-flow" : "vfurst-staff-flow";
}

export async function currentStaffOidcTransaction() {
  return readStaffOidcTransaction((await cookies()).get(staffFlowCookieName())?.value);
}

export async function beginStaffOidcFlow(input: {
  purpose: StaffOidcPurpose;
  returnTo: string;
  actor?: { userId: string; sessionId: string; authVersion: number };
}) {
  const requestHeaders = await headers();
  if (requestHeaders.has("x-vfurst-org-host") || !isPlatformHostname(normalizeHostname(requestHeaders.get("host") ?? ""))) {
    throw new StaffIdentityError("InvalidIdentity");
  }
  if (input.purpose !== "login" && !input.actor) throw new StaffIdentityError("SessionRevoked");
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  await prisma.staffOidcTransaction.create({
    data: {
      tokenHash: hashStaffProtocolValue(token), purpose: input.purpose,
      returnTo: safeReturnTo(input.returnTo), expiresAt: new Date(now.getTime() + STAFF_FLOW_MS),
      ...(input.actor ? { userId: input.actor.userId, sessionId: input.actor.sessionId, authVersion: input.actor.authVersion } : {})
    }
  });
  const cookieJar = await cookies();
  cookieJar.set(staffFlowCookieName(), token, {
    httpOnly: true, secure: new URL(getCentralAppUrl()).protocol === "https:", sameSite: "lax", path: "/", maxAge: STAFF_FLOW_MS / 1_000
  });
}

export async function clearStaffOidcFlow() {
  (await cookies()).delete(staffFlowCookieName());
}
