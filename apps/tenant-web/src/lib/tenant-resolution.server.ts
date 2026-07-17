import {
  InvalidTenantHostError,
  NonTenantHostError,
  ReservedTenantHostError,
  TenantDirectoryIntegrityError,
  TenantInactiveError,
  TenantNotFoundError,
  resolveActiveTenantContext,
  type ActiveTenantContext,
  type HostPolicy,
  type TenantDirectory
} from "@vfurst/tenant-context";
import { prismaTenantDirectory } from "@vfurst/tenant-context/prisma";
import { getTenantWebEnvironment, type TenantWebEnvironment } from "./environment";
import { createTenantWebHostPolicy } from "./tenant-host-policy";

export type TenantResolutionFailureCode =
  | "invalid_host"
  | "misdirected_request"
  | "tenant_unavailable"
  | "tenant_directory_unavailable";

export type TenantResolutionHttpFailure = Readonly<{
  ok: false;
  status: 400 | 404 | 421 | 503;
  code: TenantResolutionFailureCode;
  message: string;
  retryAfterSeconds?: number;
}>;

export type TenantResolutionHttpOutcome =
  | Readonly<{ ok: true; context: ActiveTenantContext }>
  | TenantResolutionHttpFailure;

export type TenantResolutionDependencies = Readonly<{
  policy: HostPolicy;
  directory: TenantDirectory;
}>;

function failure(
  status: TenantResolutionHttpFailure["status"],
  code: TenantResolutionFailureCode,
  message: string,
  retryAfterSeconds?: number
): TenantResolutionHttpFailure {
  return Object.freeze({
    ok: false as const,
    status,
    code,
    message,
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds })
  });
}

/** Maps tenant-directory errors without exposing organization ids or lifecycle states. */
export function mapTenantResolutionFailure(error: unknown): TenantResolutionHttpFailure {
  if (error instanceof InvalidTenantHostError) {
    return failure(400, "invalid_host", "The request Host header is invalid.");
  }
  if (error instanceof NonTenantHostError || error instanceof ReservedTenantHostError) {
    return failure(421, "misdirected_request", "This host does not belong to a tenant route.");
  }
  if (error instanceof TenantNotFoundError || error instanceof TenantInactiveError) {
    return failure(404, "tenant_unavailable", "No active tenant is available at this host.");
  }
  if (error instanceof TenantDirectoryIntegrityError) {
    return failure(
      503,
      "tenant_directory_unavailable",
      "Tenant routing is temporarily unavailable.",
      30
    );
  }
  return failure(503, "tenant_directory_unavailable", "Tenant routing is temporarily unavailable.", 30);
}

/**
 * Node/server-only organization resolution boundary. The default dependency
 * imports the Prisma directory directly; never import this module from
 * middleware or a Client Component, and never convert its result to headers.
 */
export async function resolveActiveTenantRequest(
  host: string,
  dependencies?: TenantResolutionDependencies
): Promise<TenantResolutionHttpOutcome> {
  try {
    const resolutionDependencies = dependencies ?? createTenantResolutionDependencies();
    const context = await resolveActiveTenantContext(
      host,
      resolutionDependencies.policy,
      resolutionDependencies.directory
    );
    return Object.freeze({ ok: true as const, context });
  } catch (error) {
    return mapTenantResolutionFailure(error);
  }
}

export function createTenantResolutionDependencies(
  environment: TenantWebEnvironment = getTenantWebEnvironment()
): TenantResolutionDependencies {
  return Object.freeze({
    policy: createTenantWebHostPolicy(environment),
    directory: prismaTenantDirectory
  });
}
