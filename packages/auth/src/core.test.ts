import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  AUTH_COOKIE_NAMES,
  AUTHORIZATION_STATE_BYTES,
  HOST_ONLY_SESSION_COOKIE_POLICY,
  HOST_ONLY_TRANSACTION_COOKIE_POLICY,
  MAX_LOCAL_RETURN_PATH_LENGTH,
  OPAQUE_TOKEN_BYTES,
  PASSWORD_HASH_ROUNDS,
  canManageOrganization,
  createAuthorizationState,
  createHashedOpaqueToken,
  createOpaqueToken,
  createPkceS256Challenge,
  createPkceVerifier,
  hashOpaqueToken,
  hashPassword,
  hasOrganizationRole,
  isOrganizationOwner,
  isOrganizationRole,
  isPlatformAdmin,
  isSafeLocalReturnPath,
  isValidPkceVerifier,
  normalizeIdentityEmail,
  safeLocalReturnPath,
  verifyPassword
} from "./core.js";

describe("identity and password primitives", () => {
  it("normalizes identity email without changing internal characters", () => {
    expect(normalizeIdentityEmail("  Owner+Events@Example.COM ")).toBe("owner+events@example.com");
  });

  it("hashes and verifies passwords with the shared work factor", async () => {
    const password = "Correct Horse Battery Staple 123!";
    const passwordHash = await hashPassword(password);

    expect(PASSWORD_HASH_ROUNDS).toBe(12);
    expect(passwordHash).not.toContain(password);
    await expect(verifyPassword(password, passwordHash)).resolves.toBe(true);
    await expect(verifyPassword("incorrect", passwordHash)).resolves.toBe(false);
  });

  it("rejects unsafe bcrypt work factors", async () => {
    await expect(hashPassword("password", 9)).rejects.toThrow(RangeError);
    await expect(hashPassword("password", 17)).rejects.toThrow(RangeError);
    await expect(hashPassword("password", 12.5)).rejects.toThrow(RangeError);
  });
});

describe("opaque credentials", () => {
  it("creates independent base64url secrets with a deterministic SHA-256 digest", () => {
    const first = createHashedOpaqueToken();
    const second = createHashedOpaqueToken();

    expect(OPAQUE_TOKEN_BYTES).toBe(32);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.tokenHash).toBe(createHash("sha256").update(first.token).digest("hex"));
    expect(hashOpaqueToken(first.token)).toBe(first.tokenHash);
    expect(second.token).not.toBe(first.token);
    expect(second.tokenHash).not.toBe(first.tokenHash);
  });

  it("supports bounded explicit entropy sizes", () => {
    expect(createOpaqueToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(() => createOpaqueToken(15)).toThrow(RangeError);
    expect(() => createOpaqueToken(129)).toThrow(RangeError);
    expect(() => createOpaqueToken(Number.NaN)).toThrow(RangeError);
  });
});

describe("PKCE S256 and authorization state", () => {
  it("matches the RFC 7636 S256 test vector", () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

    expect(isValidPkceVerifier(verifier)).toBe(true);
    expect(createPkceS256Challenge(verifier)).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("generates independent valid verifiers, challenges, and state", () => {
    const firstVerifier = createPkceVerifier();
    const secondVerifier = createPkceVerifier();
    const firstState = createAuthorizationState();
    const secondState = createAuthorizationState();

    expect(firstVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isValidPkceVerifier(firstVerifier)).toBe(true);
    expect(createPkceS256Challenge(firstVerifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(firstVerifier).not.toBe(secondVerifier);
    expect(AUTHORIZATION_STATE_BYTES).toBe(32);
    expect(firstState).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(firstState).not.toBe(secondState);
  });

  it("rejects malformed verifiers before deriving a challenge", () => {
    expect(isValidPkceVerifier("a".repeat(42))).toBe(false);
    expect(isValidPkceVerifier("a".repeat(129))).toBe(false);
    expect(isValidPkceVerifier(`${"a".repeat(42)}!`)).toBe(false);
    expect(() => createPkceS256Challenge("a".repeat(42))).toThrow(/PKCE verifier/);
  });
});

describe("local auth return paths", () => {
  it("keeps local paths, queries, fragments, and the first array value", () => {
    expect(safeLocalReturnPath("/account/registrations?filter=active#current")).toBe(
      "/account/registrations?filter=active#current"
    );
    expect(safeLocalReturnPath(["/invitations/token", "/ignored"])).toBe("/invitations/token");
    expect(isSafeLocalReturnPath("/")).toBe(true);
  });

  it.each([
    undefined,
    "",
    "dashboard",
    "https://attacker.example/path",
    "//attacker.example/path",
    "/\\attacker.example/path",
    "/%5cattacker.example/path",
    "/%2fattacker.example/path",
    "/path\nheader",
    "/path%0d%0aheader",
    `/path${String.fromCodePoint(127)}`,
    `/${"a".repeat(MAX_LOCAL_RETURN_PATH_LENGTH)}`
  ])("rejects an unsafe return target: %s", (candidate) => {
    expect(safeLocalReturnPath(candidate, "/account")).toBe("/account");
    expect(isSafeLocalReturnPath(candidate)).toBe(false);
  });
});

describe("host-only cookie policy", () => {
  it("uses distinct __Host cookies and omits a Domain attribute", () => {
    expect(AUTH_COOKIE_NAMES).toEqual({
      managerSession: "__Host-vfurst-manager-session",
      tenantSession: "__Host-vfurst-tenant-session",
      tenantTransaction: "__Host-vfurst-auth-transaction"
    });
    expect(new Set(Object.values(AUTH_COOKIE_NAMES)).size).toBe(3);
    expect(Object.values(AUTH_COOKIE_NAMES).every((name) => name.startsWith("__Host-"))).toBe(true);
    expect(HOST_ONLY_SESSION_COOKIE_POLICY).toEqual({
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true
    });
    expect("domain" in HOST_ONLY_SESSION_COOKIE_POLICY).toBe(false);
    expect(HOST_ONLY_TRANSACTION_COOKIE_POLICY.maxAge).toBe(300);
    expect(Object.isFrozen(AUTH_COOKIE_NAMES)).toBe(true);
    expect(Object.isFrozen(HOST_ONLY_SESSION_COOKIE_POLICY)).toBe(true);
    expect(Object.isFrozen(HOST_ONLY_TRANSACTION_COOKIE_POLICY)).toBe(true);
  });
});

describe("pure role predicates", () => {
  it("distinguishes platform administration from ordinary identity", () => {
    expect(isPlatformAdmin("PLATFORM_ADMIN")).toBe(true);
    expect(isPlatformAdmin("USER")).toBe(false);
    expect(isPlatformAdmin(undefined)).toBe(false);
  });

  it("recognizes organization roles without granting unknown values", () => {
    expect(isOrganizationRole("OWNER")).toBe(true);
    expect(isOrganizationRole("ADMIN")).toBe(true);
    expect(isOrganizationRole("MEMBER")).toBe(true);
    expect(isOrganizationRole("PLATFORM_ADMIN")).toBe(false);
    expect(isOrganizationRole(null)).toBe(false);
  });

  it("keeps management and owner checks explicit", () => {
    expect(canManageOrganization("OWNER")).toBe(true);
    expect(canManageOrganization("ADMIN")).toBe(true);
    expect(canManageOrganization("MEMBER")).toBe(false);
    expect(hasOrganizationRole("MEMBER", ["MEMBER"])).toBe(true);
    expect(hasOrganizationRole("MEMBER", ["OWNER", "ADMIN"])).toBe(false);
    expect(isOrganizationOwner("OWNER")).toBe(true);
    expect(isOrganizationOwner("ADMIN")).toBe(false);
  });
});
