import {
  NonTenantHostError,
  ReservedTenantHostError,
  TenantDirectoryIntegrityError,
  TenantInactiveError,
  TenantNotFoundError
} from "./errors.js";
import { classifyTenantHost, normalizeHostname, type HostPolicy } from "./host.js";
import {
  TENANT_STATUSES,
  type ActiveTenantContext,
  type TenantContext,
  type TenantDirectory,
  type TenantDirectoryRecord
} from "./types.js";

function validateDirectoryRecord(
  record: TenantDirectoryRecord,
  hostname: string,
  expected: { subdomain: string } | { customDomain: string }
) {
  if (!record.organizationId || !record.slug || !TENANT_STATUSES.includes(record.status)) {
    throw new TenantDirectoryIntegrityError(hostname, "The tenant directory returned an incomplete or invalid record.");
  }

  if ("subdomain" in expected) {
    let recordSubdomain: string;
    try {
      recordSubdomain = normalizeHostname(record.subdomain);
    } catch {
      throw new TenantDirectoryIntegrityError(hostname, "The tenant directory returned an invalid subdomain record.");
    }
    if (recordSubdomain !== expected.subdomain || recordSubdomain.includes(".")) {
      throw new TenantDirectoryIntegrityError(hostname, "The tenant directory returned a different managed subdomain.");
    }
    return;
  }

  if (!record.customDomain) {
    throw new TenantDirectoryIntegrityError(hostname, "The tenant directory returned a custom-domain record with no assigned domain.");
  }

  let assignedDomain: string;
  try {
    assignedDomain = normalizeHostname(record.customDomain);
  } catch {
    throw new TenantDirectoryIntegrityError(hostname, "The tenant directory returned an invalid assigned custom domain.");
  }
  if (assignedDomain !== expected.customDomain) {
    throw new TenantDirectoryIntegrityError(hostname, "The tenant directory returned a different assigned custom domain.");
  }
}

export async function resolveTenantContext(
  input: string,
  policy: HostPolicy,
  directory: TenantDirectory
): Promise<TenantContext> {
  const classification = classifyTenantHost(input, policy);

  if (classification.kind === "platform") {
    throw new NonTenantHostError(classification.hostname, classification.roles);
  }
  if (classification.kind === "reserved-platform") {
    throw new ReservedTenantHostError(classification.hostname, classification.reason);
  }

  const record =
    classification.kind === "managed-subdomain"
      ? await directory.findByManagedSubdomain(classification.subdomain)
      : await directory.findByCustomDomain(classification.hostname);

  if (!record) {
    throw new TenantNotFoundError(classification.hostname);
  }

  validateDirectoryRecord(
    record,
    classification.hostname,
    classification.kind === "managed-subdomain"
      ? { subdomain: classification.subdomain }
      : { customDomain: classification.hostname }
  );

  return Object.freeze({
    organizationId: record.organizationId,
    slug: record.slug,
    hostname: classification.hostname,
    domainKind: classification.kind === "managed-subdomain" ? "platform-subdomain" : "custom-domain",
    status: record.status
  });
}

export function requireActiveTenantContext(context: TenantContext): ActiveTenantContext {
  if (context.status !== "ACTIVE") {
    throw new TenantInactiveError(context as TenantContext & { status: Exclude<TenantContext["status"], "ACTIVE"> });
  }
  return context as ActiveTenantContext;
}

export async function resolveActiveTenantContext(
  input: string,
  policy: HostPolicy,
  directory: TenantDirectory
): Promise<ActiveTenantContext> {
  return requireActiveTenantContext(await resolveTenantContext(input, policy, directory));
}
