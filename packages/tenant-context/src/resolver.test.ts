import { describe, expect, it, vi } from "vitest";
import {
  NonTenantHostError,
  ReservedTenantHostError,
  TenantDirectoryIntegrityError,
  TenantInactiveError,
  TenantNotFoundError
} from "./errors.js";
import { createHostPolicy } from "./host.js";
import { requireActiveTenantContext, resolveActiveTenantContext, resolveTenantContext } from "./resolver.js";
import type { TenantDirectory, TenantDirectoryRecord } from "./types.js";

const policy = createHostPolicy({
  rootDomain: "vfurst.example.com",
  managerHostname: "vfurst.example.com",
  consoleHostname: "console.vfurst.example.com",
  apiHostname: "api.vfurst.example.com",
  reservedSubdomains: ["www"]
});

const activeRecord: TenantDirectoryRecord = {
  organizationId: "3e8cb9e3-192b-4b61-9b86-890b2e599ab6",
  slug: "sample-organization",
  subdomain: "sample-con",
  customDomain: "events.customer.example",
  status: "ACTIVE"
};

function directory(overrides: Partial<TenantDirectory> = {}): TenantDirectory {
  return {
    findByManagedSubdomain: vi.fn(async (subdomain) => subdomain === activeRecord.subdomain ? activeRecord : null),
    findByCustomDomain: vi.fn(async (hostname) => hostname === activeRecord.customDomain ? activeRecord : null),
    ...overrides
  };
}

describe("resolveTenantContext", () => {
  it("resolves a managed hostname to a minimal immutable context", async () => {
    const source = directory();
    const context = await resolveTenantContext("SAMPLE-CON.VFURST.EXAMPLE.COM:443", policy, source);

    expect(context).toEqual({
      organizationId: activeRecord.organizationId,
      slug: activeRecord.slug,
      hostname: "sample-con.vfurst.example.com",
      domainKind: "platform-subdomain",
      status: "ACTIVE"
    });
    expect(Object.isFrozen(context)).toBe(true);
    expect(source.findByManagedSubdomain).toHaveBeenCalledWith("sample-con");
    expect(source.findByCustomDomain).not.toHaveBeenCalled();
  });

  it("resolves only the currently assigned custom domain", async () => {
    const source = directory();
    const context = await resolveTenantContext("EVENTS.CUSTOMER.EXAMPLE.", policy, source);

    expect(context.domainKind).toBe("custom-domain");
    expect(context.hostname).toBe("events.customer.example");
    expect(source.findByCustomDomain).toHaveBeenCalledWith("events.customer.example");
    expect(source.findByManagedSubdomain).not.toHaveBeenCalled();
  });

  it("keeps the assigned custom domain routable while a replacement request is pending", async () => {
    const recordDuringReplacement = {
      ...activeRecord,
      customDomain: "events.customer.example",
      requestedCustomDomain: "replacement.customer.example",
      customDomainStatus: "PENDING_VERIFICATION"
    };
    const source = directory({
      findByCustomDomain: vi.fn(async (hostname) => hostname === recordDuringReplacement.customDomain ? recordDuringReplacement : null)
    });

    await expect(resolveActiveTenantContext("events.customer.example", policy, source)).resolves.toMatchObject({
      organizationId: activeRecord.organizationId,
      status: "ACTIVE"
    });
    await expect(resolveTenantContext("replacement.customer.example", policy, source)).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it.each(["PROVISIONING", "SUSPENDED", "RETIRED"] as const)(
    "returns %s context for read policy but fails the active boundary",
    async (status) => {
      const record = { ...activeRecord, status };
      const source = directory({ findByManagedSubdomain: vi.fn(async () => record) });
      const context = await resolveTenantContext("sample-con.vfurst.example.com", policy, source);

      expect(context.status).toBe(status);
      expect(() => requireActiveTenantContext(context)).toThrow(TenantInactiveError);
      await expect(resolveActiveTenantContext("sample-con.vfurst.example.com", policy, source)).rejects.toMatchObject({
        code: "TENANT_INACTIVE",
        status
      });
    }
  );

  it("rejects platform, reserved, and unknown hosts with typed errors before granting context", async () => {
    const source = directory();
    await expect(resolveTenantContext("vfurst.example.com", policy, source)).rejects.toBeInstanceOf(NonTenantHostError);
    await expect(resolveTenantContext("www.vfurst.example.com", policy, source)).rejects.toBeInstanceOf(ReservedTenantHostError);
    await expect(resolveTenantContext("missing.vfurst.example.com", policy, source)).rejects.toBeInstanceOf(TenantNotFoundError);
  });

  it("fails closed when a directory adapter returns a mismatched managed record", async () => {
    const source = directory({
      findByManagedSubdomain: vi.fn(async () => ({ ...activeRecord, subdomain: "other-con" }))
    });
    await expect(resolveTenantContext("sample-con.vfurst.example.com", policy, source)).rejects.toBeInstanceOf(
      TenantDirectoryIntegrityError
    );
  });

  it("fails closed when a directory adapter returns a stale custom-domain assignment", async () => {
    const source = directory({
      findByCustomDomain: vi.fn(async () => ({ ...activeRecord, customDomain: "old.customer.example" }))
    });
    await expect(resolveTenantContext("events.customer.example", policy, source)).rejects.toBeInstanceOf(
      TenantDirectoryIntegrityError
    );
  });
});
