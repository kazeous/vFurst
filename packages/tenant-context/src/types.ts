export const TENANT_STATUSES = ["ACTIVE", "SUSPENDED", "PROVISIONING", "RETIRED"] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];
export type TenantDomainKind = "platform-subdomain" | "custom-domain";

export type TenantContext = Readonly<{
  organizationId: string;
  slug: string;
  hostname: string;
  domainKind: TenantDomainKind;
  status: TenantStatus;
}>;

export type ActiveTenantContext = TenantContext & Readonly<{ status: "ACTIVE" }>;

export type TenantDirectoryRecord = Readonly<{
  organizationId: string;
  slug: string;
  subdomain: string;
  /** The currently assigned routing domain, not a pending replacement request. */
  customDomain: string | null;
  status: TenantStatus;
}>;

export interface TenantDirectory {
  findByManagedSubdomain(subdomain: string): Promise<TenantDirectoryRecord | null>;
  findByCustomDomain(hostname: string): Promise<TenantDirectoryRecord | null>;
}

export type TenantRoutingAddress = Readonly<{
  subdomain: string;
  /** Pass only the domain currently assigned for routing. */
  customDomain?: string | null;
}>;
