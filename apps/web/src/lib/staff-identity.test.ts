import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    account: { findUnique: vi.fn() }
  },
  baseLinkAccount: vi.fn(),
  PrismaAdapter: vi.fn()
}));

vi.mock("@vfurst/db", () => ({ prisma: mocks.prisma }));
vi.mock("@auth/prisma-adapter", () => ({ PrismaAdapter: mocks.PrismaAdapter }));

import {
  createStaffAdapter,
  findStaffEmailConflict,
  parseStaffClaims,
  resolveStaffSessionMaxAgeSeconds,
  STAFF_SESSION_MAX_AGE_SECONDS,
  staffPlatformRole,
  syncStaffUser,
  type StaffClaims
} from "./staff-identity";

const now = new Date("2026-10-17T00:00:00.000Z");
const claims: StaffClaims = {
  sub: "authentik-sub-1",
  email: "staff@example.com",
  emailVerified: true,
  name: "Staff Member",
  image: null,
  groups: [],
  sid: null
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.PrismaAdapter.mockReturnValue({ linkAccount: mocks.baseLinkAccount, createUser: vi.fn() });
});

describe("staff identity claims", () => {
  it("parses authentik claims and normalizes the email", () => {
    expect(
      parseStaffClaims({
        sub: "authentik-sub-1",
        email: " Staff@Example.COM ",
        email_verified: true,
        preferred_username: "staff",
        picture: "https://cdn.example.com/a.png",
        groups: ["vfurst-platform-admins", 42, null],
        sid: "sid-1"
      })
    ).toEqual({
      sub: "authentik-sub-1",
      email: "staff@example.com",
      emailVerified: true,
      name: "staff",
      image: "https://cdn.example.com/a.png",
      groups: ["vfurst-platform-admins"],
      sid: "sid-1"
    });
  });

  it("rejects claims without a subject or a valid email", () => {
    expect(parseStaffClaims({ email: "staff@example.com" })).toBeNull();
    expect(parseStaffClaims({ sub: "s", email: "not-an-email" })).toBeNull();
    expect(parseStaffClaims({ sub: "s" })).toBeNull();
    expect(parseStaffClaims(null)).toBeNull();
  });

  it("maps the configured admin group to PLATFORM_ADMIN and everything else to USER", () => {
    expect(staffPlatformRole(["vfurst-platform-admins"])).toBe("PLATFORM_ADMIN");
    expect(staffPlatformRole(["staff", "other"])).toBe("USER");
    expect(staffPlatformRole(["ops"], "ops")).toBe("PLATFORM_ADMIN");
    expect(staffPlatformRole([])).toBe("USER");
  });

  it("session lifetime defaults to 12 hours and honours a positive override", () => {
    expect(STAFF_SESSION_MAX_AGE_SECONDS).toBe(43_200);
    expect(resolveStaffSessionMaxAgeSeconds(undefined)).toBe(43_200);
    expect(resolveStaffSessionMaxAgeSeconds("3600")).toBe(3_600);
    expect(resolveStaffSessionMaxAgeSeconds("0")).toBe(43_200);
    expect(resolveStaffSessionMaxAgeSeconds("-5")).toBe(43_200);
    expect(resolveStaffSessionMaxAgeSeconds("12.5")).toBe(43_200);
    expect(resolveStaffSessionMaxAgeSeconds("86400")).toBe(43_200);
  });
});

describe("staff user synchronization", () => {
  it("syncs profile, role, and verified state, keeping an existing verification timestamp", async () => {
    const verifiedAt = new Date("2026-01-01T00:00:00.000Z");
    mocks.prisma.user.findUnique.mockResolvedValue({ email: claims.email, emailVerified: verifiedAt });

    await syncStaffUser("user-1", { ...claims, groups: ["vfurst-platform-admins"] }, now);

    expect(mocks.prisma.user.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: "user-1" },
      data: {
        email: "staff@example.com",
        name: "Staff Member",
        image: null,
        emailVerified: verifiedAt,
        platformRole: "PLATFORM_ADMIN"
      }
    });
  });

  it("sets the verification time when an unverified user's claim becomes verified", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ emailVerified: null });

    await syncStaffUser("user-1", claims, now);

    expect(mocks.prisma.user.update.mock.calls[0]?.[0].data).toMatchObject({ emailVerified: now, platformRole: "USER" });
  });

  it("clears emailVerified when the claim is false", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ emailVerified: new Date("2026-01-01T00:00:00.000Z") });

    await syncStaffUser("user-1", { ...claims, emailVerified: false }, now);

    expect(mocks.prisma.user.update.mock.calls[0]?.[0].data).toMatchObject({ emailVerified: null });
  });
});

describe("staff email conflicts", () => {
  it("reports a conflict when a new subject meets an existing email", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "existing-user" });
    mocks.prisma.account.findUnique.mockResolvedValue(null);

    await expect(findStaffEmailConflict(claims)).resolves.toEqual({ existingUserId: "existing-user", linkedUserId: null });
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: "staff@example.com" }, select: { id: true } });
    expect(mocks.prisma.account.findUnique).toHaveBeenCalledWith({
      where: { provider_providerAccountId: { provider: "authentik", providerAccountId: "authentik-sub-1" } },
      select: { userId: true }
    });
  });

  it("reports a conflict when a linked subject's new email belongs to another user", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "other-user" });
    mocks.prisma.account.findUnique.mockResolvedValue({ userId: "linked-user" });

    await expect(findStaffEmailConflict(claims)).resolves.toEqual({ existingUserId: "other-user", linkedUserId: "linked-user" });
  });

  it("reports no conflict for the linked owner of the email", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "linked-user" });
    mocks.prisma.account.findUnique.mockResolvedValue({ userId: "linked-user" });

    await expect(findStaffEmailConflict(claims)).resolves.toBeNull();
  });

  it("reports no conflict for an email nobody holds", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.account.findUnique.mockResolvedValue(null);

    await expect(findStaffEmailConflict(claims)).resolves.toBeNull();
  });
});

describe("staff adapter", () => {
  it("the adapter persists no access, refresh, or ID token", async () => {
    const adapter = createStaffAdapter(mocks.prisma as never);

    await adapter.linkAccount?.({
      type: "oidc",
      provider: "authentik",
      providerAccountId: "authentik-sub-1",
      userId: "user-1",
      access_token: "access",
      refresh_token: "refresh",
      id_token: "id",
      expires_at: 123,
      token_type: "bearer",
      scope: "openid",
      session_state: "state"
    });

    expect(mocks.baseLinkAccount).toHaveBeenCalledExactlyOnceWith({
      type: "oidc",
      provider: "authentik",
      providerAccountId: "authentik-sub-1",
      userId: "user-1"
    });
  });
});
