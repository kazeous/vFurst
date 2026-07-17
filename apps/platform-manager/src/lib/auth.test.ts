import { AUTH_COOKIE_NAMES, HOST_ONLY_SESSION_COOKIE_POLICY } from "@vfurst/auth/core";
import { describe, expect, it } from "vitest";
import { MANAGER_SESSION_COOKIE, managerGoogleProviderOptions } from "./auth-policy.js";

describe("platform-manager authentication policy", () => {
  it("uses a secure host-only manager session cookie", () => {
    expect(MANAGER_SESSION_COOKIE).toEqual({
      name: AUTH_COOKIE_NAMES.managerSession,
      options: HOST_ONLY_SESSION_COOKIE_POLICY
    });
    expect(MANAGER_SESSION_COOKIE.name).toBe("__Host-vfurst-manager-session");
    expect(MANAGER_SESSION_COOKIE.options).not.toHaveProperty("domain");
    expect(MANAGER_SESSION_COOKIE.options.secure).toBe(true);
  });

  it("does not enable dangerous Google email auto-linking", () => {
    expect(managerGoogleProviderOptions("client", "secret")).toEqual({
      clientId: "client",
      clientSecret: "secret"
    });
    expect(managerGoogleProviderOptions("client", "secret")).not.toHaveProperty(
      "allowDangerousEmailAccountLinking"
    );
  });
});
