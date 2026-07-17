import { createHostPolicy, type TenantDirectory, type TenantDirectoryRecord } from "@vfurst/tenant-context";
import { describe, expect, it, vi } from "vitest";
import {
  resolveActiveTenantRequest,
  type TenantResolutionDependencies
} from "./tenant-resolution.server";

const policy = createHostPolicy({
  rootDomain: "vfurst.example.com",
  managerHostname: "vfurst.example.com",
  consoleHostname: "console.vfurst.example.com",
  apiHostname: "api.vfurst.example.com",
  reservedSubdomains: ["assets", "www"]
});

const activeRecord: TenantDirectoryRecord = {
  organizationId: "3e8cb9e3-192b-4b61-9b86-890b2e599ab6",
  slug: "sample-organization",
  subdomain: "sample-con",
  customDomain: "events.customer.example",
  status: "ACTIVE"
};

function createDirectory(record: TenantDirectoryRecord = activeRecord): TenantDirectory {
  return {
    findByManagedSubdomain: vi.fn(async (subdomain) => subdomain === record.subdomain ? record : null),
    findByCustomDomain: vi.fn(async (hostname) => hostname === record.customDomain ? record : null)
  };
}

function dependencies(directory = createDirectory()): TenantResolutionDependencies {
  return { policy, directory };
}

describe("resolveActiveTenantRequest", () => {
  it.each([
    ["sample-con.vfurst.example.com", "platform-subdomain"],
    ["events.customer.example", "custom-domain"]
  ] as const)("resolves active tenant host %s", async (host, domainKind) => {
    await expect(resolveActiveTenantRequest(host, dependencies())).resolves.toEqual({
      ok: true,
      context: {
        organizationId: activeRecord.organizationId,
        slug: activeRecord.slug,
        hostname: host,
        domainKind,
        status: "ACTIVE"
      }
    });
  });

  it("returns the same non-leaking outcome for unknown and suspended tenants", async () => {
    const suspended = { ...activeRecord, status: "SUSPENDED" as const };
    const unknown = await resolveActiveTenantRequest("missing.vfurst.example.com", dependencies());
    const inactive = await resolveActiveTenantRequest(
      "sample-con.vfurst.example.com",
      dependencies(createDirectory(suspended))
    );

    expect(unknown).toEqual({
      ok: false,
      status: 404,
      code: "tenant_unavailable",
      message: "No active tenant is available at this host."
    });
    expect(inactive).toEqual(unknown);
    expect(JSON.stringify(inactive)).not.toContain(activeRecord.organizationId);
    expect(JSON.stringify(inactive)).not.toContain("SUSPENDED");
  });

  it("keeps the assigned custom domain active while its replacement is pending", async () => {
    const duringReplacement = {
      ...activeRecord,
      requestedCustomDomain: "replacement.customer.example",
      customDomainStatus: "PENDING_VERIFICATION"
    };
    const directory: TenantDirectory = {
      findByManagedSubdomain: vi.fn(async () => null),
      findByCustomDomain: vi.fn(async (hostname) =>
        hostname === duringReplacement.customDomain ? duringReplacement : null
      )
    };

    await expect(resolveActiveTenantRequest("events.customer.example", dependencies(directory))).resolves.toMatchObject({
      ok: true,
      context: { organizationId: activeRecord.organizationId }
    });
    await expect(resolveActiveTenantRequest("replacement.customer.example", dependencies(directory))).resolves.toEqual({
      ok: false,
      status: 404,
      code: "tenant_unavailable",
      message: "No active tenant is available at this host."
    });
  });

  it("maps invalid and reserved hosts to explicit non-tenant outcomes", async () => {
    await expect(resolveActiveTenantRequest("not a host", dependencies())).resolves.toMatchObject({
      ok: false,
      status: 400,
      code: "invalid_host"
    });
    await expect(resolveActiveTenantRequest("www.vfurst.example.com", dependencies())).resolves.toMatchObject({
      ok: false,
      status: 421,
      code: "misdirected_request"
    });
    await expect(resolveActiveTenantRequest("vfurst.example.com", dependencies())).resolves.toMatchObject({
      ok: false,
      status: 421,
      code: "misdirected_request"
    });
  });

  it("fails closed and hides mismatched directory records", async () => {
    const mismatched: TenantDirectory = {
      findByManagedSubdomain: vi.fn(async () => ({ ...activeRecord, subdomain: "other-con" })),
      findByCustomDomain: vi.fn(async () => null)
    };
    const outcome = await resolveActiveTenantRequest("sample-con.vfurst.example.com", dependencies(mismatched));

    expect(outcome).toEqual({
      ok: false,
      status: 503,
      code: "tenant_directory_unavailable",
      message: "Tenant routing is temporarily unavailable.",
      retryAfterSeconds: 30
    });
    expect(JSON.stringify(outcome)).not.toContain("other-con");
  });
});
