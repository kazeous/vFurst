import type { TenantContext, TenantStatus } from "./types.js";

export type TenantContextErrorCode =
  | "INVALID_TENANT_HOST"
  | "NON_TENANT_HOST"
  | "RESERVED_TENANT_HOST"
  | "TENANT_NOT_FOUND"
  | "TENANT_INACTIVE"
  | "TENANT_DIRECTORY_INTEGRITY";

export class TenantContextError extends Error {
  readonly code: TenantContextErrorCode;

  constructor(code: TenantContextErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "TenantContextError";
    this.code = code;
  }
}

export class InvalidTenantHostError extends TenantContextError {
  readonly input: string;

  constructor(input: string, message = "The hostname is invalid.") {
    super("INVALID_TENANT_HOST", message);
    this.name = "InvalidTenantHostError";
    this.input = input;
  }
}

export class NonTenantHostError extends TenantContextError {
  readonly hostname: string;
  readonly roles: readonly string[];

  constructor(hostname: string, roles: readonly string[]) {
    super("NON_TENANT_HOST", `The hostname ${hostname} belongs to the platform, not a tenant.`);
    this.name = "NonTenantHostError";
    this.hostname = hostname;
    this.roles = Object.freeze([...roles]);
  }
}

export class ReservedTenantHostError extends TenantContextError {
  readonly hostname: string;
  readonly reason: "reserved-subdomain" | "nested-platform-subdomain";

  constructor(hostname: string, reason: ReservedTenantHostError["reason"]) {
    super("RESERVED_TENANT_HOST", `The hostname ${hostname} is reserved by the platform.`);
    this.name = "ReservedTenantHostError";
    this.hostname = hostname;
    this.reason = reason;
  }
}

export class TenantNotFoundError extends TenantContextError {
  readonly hostname: string;

  constructor(hostname: string) {
    super("TENANT_NOT_FOUND", `No tenant is assigned to ${hostname}.`);
    this.name = "TenantNotFoundError";
    this.hostname = hostname;
  }
}

export class TenantInactiveError extends TenantContextError {
  readonly context: TenantContext;
  readonly status: Exclude<TenantStatus, "ACTIVE">;

  constructor(context: TenantContext & { status: Exclude<TenantStatus, "ACTIVE"> }) {
    super("TENANT_INACTIVE", `Tenant ${context.organizationId} is ${context.status.toLowerCase()}.`);
    this.name = "TenantInactiveError";
    this.context = context;
    this.status = context.status;
  }
}

export class TenantDirectoryIntegrityError extends TenantContextError {
  readonly hostname: string;

  constructor(hostname: string, message: string) {
    super("TENANT_DIRECTORY_INTEGRITY", message);
    this.name = "TenantDirectoryIntegrityError";
    this.hostname = hostname;
  }
}
