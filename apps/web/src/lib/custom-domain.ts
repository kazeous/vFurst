import { createHash } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { getRootDomain } from "./platform-hosts";

const DOMAIN_SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "vfurst-local-domain-secret";

export function normalizeCustomDomain(domain: string) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

export function getCustomDomainRecords(orgId: string, domain: string) {
  const normalized = normalizeCustomDomain(domain);
  const rootDomain = getRootDomain();
  const token = createHash("sha256").update(`${orgId}:${normalized}:${DOMAIN_SECRET}`).digest("hex").slice(0, 32);

  return {
    domain: normalized,
    cnameName: normalized,
    cnameValue: `app.${rootDomain}`,
    txtName: `_vfurst-challenge.${normalized}`,
    txtValue: `vfurst-domain-verification=${token}`
  };
}

export async function isCustomDomainVerified(orgId: string, domain: string) {
  const records = getCustomDomainRecords(orgId, domain);

  try {
    const answers = await resolveTxt(records.txtName);
    return answers.some((parts) => parts.join("").trim() === records.txtValue);
  } catch {
    return false;
  }
}
