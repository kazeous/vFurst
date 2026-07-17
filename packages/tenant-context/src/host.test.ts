import { describe, expect, it } from "vitest";
import { InvalidTenantHostError } from "./errors.js";
import { classifyTenantHost, createHostPolicy, normalizeHostname } from "./host.js";

const policy = createHostPolicy({
  rootDomain: "vfurst.example.com",
  managerHostname: "vfurst.example.com",
  consoleHostname: "console.vfurst.example.com",
  apiHostname: "api.vfurst.example.com",
  reservedSubdomains: ["www", "app", "auth", "www"]
});

describe("normalizeHostname", () => {
  it.each([
    [" Events.Example.COM:443 ", "events.example.com"],
    ["events.example.com.:8443", "events.example.com"],
    ["münchen.example", "xn--mnchen-3ya.example"],
    ["127.0.0.1:3000", "127.0.0.1"],
    ["[2001:0db8::1]:3000", "2001:db8::1"],
    ["2001:0db8::1", "2001:db8::1"]
  ])("normalizes %s", (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });

  it.each([
    "",
    "https://events.example.com",
    "events.example.com/path",
    "events.example.com?query=1",
    "user@events.example.com",
    "bad_host.example.com",
    "-bad.example.com",
    "events.example.com:99999",
    "[not-ipv6]:3000",
    `a${"a".repeat(63)}.example.com`
  ])("rejects invalid host input %s", (input) => {
    expect(() => normalizeHostname(input)).toThrow(InvalidTenantHostError);
  });
});

describe("HostPolicy", () => {
  it("normalizes and freezes explicit host policy without reading environment", () => {
    const before = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "ignored.example";
    try {
      expect(policy.rootDomain).toBe("vfurst.example.com");
      expect(policy.reservedSubdomains).toEqual(["app", "auth", "www"]);
      expect(Object.isFrozen(policy)).toBe(true);
      expect(Object.isFrozen(policy.reservedSubdomains)).toBe(true);
    } finally {
      if (before === undefined) delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
      else process.env.NEXT_PUBLIC_ROOT_DOMAIN = before;
    }
  });

  it("rejects malformed reserved labels and an IPv6 tenant root", () => {
    expect(() => createHostPolicy({ ...policy, reservedSubdomains: ["bad.label"] })).toThrow(InvalidTenantHostError);
    expect(() => createHostPolicy({ ...policy, rootDomain: "[::1]" })).toThrow(InvalidTenantHostError);
  });
});

describe("classifyTenantHost", () => {
  it("reports all roles when the manager is also the root host", () => {
    expect(classifyTenantHost("VFURST.EXAMPLE.COM:443", policy)).toEqual({
      kind: "platform",
      hostname: "vfurst.example.com",
      roles: ["root", "manager"]
    });
  });

  it.each([
    ["console.vfurst.example.com", ["console"]],
    ["api.vfurst.example.com", ["api"]]
  ])("recognizes explicit platform host %s", (hostname, roles) => {
    expect(classifyTenantHost(hostname, policy)).toEqual({ kind: "platform", hostname, roles });
  });

  it("extracts exactly one managed tenant label", () => {
    expect(classifyTenantHost("sample-con.vfurst.example.com", policy)).toEqual({
      kind: "managed-subdomain",
      hostname: "sample-con.vfurst.example.com",
      subdomain: "sample-con"
    });
  });

  it("rejects reserved and nested names below the managed root", () => {
    expect(classifyTenantHost("www.vfurst.example.com", policy)).toEqual({
      kind: "reserved-platform",
      hostname: "www.vfurst.example.com",
      reason: "reserved-subdomain"
    });
    expect(classifyTenantHost("nested.sample.vfurst.example.com", policy)).toEqual({
      kind: "reserved-platform",
      hostname: "nested.sample.vfurst.example.com",
      reason: "nested-platform-subdomain"
    });
  });

  it("treats an external assigned hostname as a custom-domain candidate", () => {
    expect(classifyTenantHost("events.customer.example", policy)).toEqual({
      kind: "custom-domain",
      hostname: "events.customer.example"
    });
  });
});
