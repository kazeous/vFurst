import { describe, expect, it } from "vitest";
import { InvalidTenantHostError, ReservedTenantHostError } from "./errors.js";
import { createHostPolicy } from "./host.js";
import {
  buildApiUrl,
  buildConsoleUrl,
  buildHostUrl,
  buildManagerUrl,
  buildOrigin,
  buildTenantContextUrl,
  buildTenantUrl,
  getCanonicalTenantHostname,
  normalizeApplicationPath
} from "./urls.js";

const policy = createHostPolicy({
  rootDomain: "vfurst.example.com",
  managerHostname: "vfurst.example.com",
  consoleHostname: "console.vfurst.example.com",
  apiHostname: "api.vfurst.example.com",
  reservedSubdomains: ["www", "app"]
});

describe("tenant URL builders", () => {
  it("prefers the currently assigned custom domain", () => {
    const address = { subdomain: "sample-con", customDomain: "Events.Customer.Example." };
    expect(getCanonicalTenantHostname(address, policy)).toBe("events.customer.example");
    expect(buildTenantUrl(address, policy, "/register?source=email")).toBe(
      "https://events.customer.example/register?source=email"
    );
  });

  it("builds a managed hostname when no custom domain is assigned", () => {
    expect(buildTenantUrl({ subdomain: "sample-con" }, policy, "hotel", "http")).toBe(
      "http://sample-con.vfurst.example.com/hotel"
    );
  });

  it("rejects reserved managed names and platform custom-domain assignments", () => {
    expect(() => getCanonicalTenantHostname({ subdomain: "www" }, policy)).toThrow(ReservedTenantHostError);
    expect(() => getCanonicalTenantHostname({ subdomain: "sample", customDomain: "api.vfurst.example.com" }, policy)).toThrow(
      InvalidTenantHostError
    );
  });

  it("builds from the verified request context rather than changing host preference", () => {
    expect(buildTenantContextUrl({
      organizationId: "3e8cb9e3-192b-4b61-9b86-890b2e599ab6",
      slug: "sample",
      hostname: "sample-con.vfurst.example.com",
      domainKind: "platform-subdomain",
      status: "ACTIVE"
    }, "/store")).toBe("https://sample-con.vfurst.example.com/store");
  });

  it("builds explicit manager, console, and API URLs", () => {
    expect(buildManagerUrl(policy, "/account")).toBe("https://vfurst.example.com/account");
    expect(buildConsoleUrl(policy, "/dashboard")).toBe("https://console.vfurst.example.com/dashboard");
    expect(buildApiUrl(policy, "/v1/events")).toBe("https://api.vfurst.example.com/v1/events");
  });

  it("formats IPv6 hosts safely when building local URLs", () => {
    expect(buildOrigin("[::1]:3000", "http")).toBe("http://[::1]");
    expect(buildHostUrl("[::1]", "/health", "http")).toBe("http://[::1]/health");
  });
});

describe("normalizeApplicationPath", () => {
  it.each([
    [undefined, "/"],
    ["", "/"],
    ["register", "/register"],
    ["/register?source=email#details", "/register?source=email#details"]
  ])("normalizes %s", (input, expected) => {
    expect(normalizeApplicationPath(input)).toBe(expected);
  });

  it.each(["//attacker.example/path", "https://attacker.example", "/\\attacker.example", "/path\nnext"])(
    "rejects unsafe path %s",
    (path) => {
      expect(() => normalizeApplicationPath(path)).toThrow();
    }
  );
});
