import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class PrismaClientKnownRequestError extends Error {
    code: string;

    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }

  return {
    PrismaClientKnownRequestError,
    user: {
      findUnique: vi.fn(),
      create: vi.fn()
    },
    hashPassword: vi.fn(),
    redirect: vi.fn()
  };
});

vi.mock("@vfurst/auth/core", () => ({
  createHashedOpaqueToken: vi.fn(),
  hashOpaqueToken: vi.fn(),
  hashPassword: mocks.hashPassword,
  normalizeIdentityEmail: (email: string) => email.trim().toLowerCase()
}));
vi.mock("@vfurst/db", () => ({
  Prisma: {
    PrismaClientKnownRequestError: mocks.PrismaClientKnownRequestError
  },
  prisma: {
    user: mocks.user
  }
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/return-to", () => ({ safeReturnTo: (value?: string) => value || "/dashboard" }));
vi.mock("@/lib/email", () => ({ sendPlatformEmail: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ assertAuthActionRateLimit: vi.fn() }));
vi.mock("@/lib/central-url", () => ({ getCentralAppUrl: () => "https://vfurst.example" }));

import { registerUser } from "./auth-actions";

function registrationForm(overrides: Partial<Record<"name" | "email" | "password" | "returnTo", string>> = {}) {
  const formData = new FormData();
  formData.set("name", overrides.name ?? "Existing Attendee");
  formData.set("email", overrides.email ?? "Existing@Example.com");
  formData.set("password", overrides.password ?? "Password123!");
  formData.set("returnTo", overrides.returnTo ?? "/dashboard");
  return formData;
}

describe("registerUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hashPassword.mockResolvedValue("hashed-password");
    mocks.user.create.mockResolvedValue({ id: "user-1" });
  });

  it("returns a form error instead of throwing when the account already exists", async () => {
    mocks.user.findUnique.mockResolvedValue({ id: "existing-user" });

    await expect(registerUser({}, registrationForm())).resolves.toEqual({
      error: "An account already exists for this email address.",
      reason: "account_exists"
    });

    expect(mocks.user.findUnique).toHaveBeenCalledWith({
      where: { email: "existing@example.com" },
      select: { id: true }
    });
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.user.create).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("turns a concurrent unique-email conflict into the same form error", async () => {
    mocks.user.findUnique.mockResolvedValue(null);
    mocks.user.create.mockRejectedValue(new mocks.PrismaClientKnownRequestError("P2002"));

    await expect(registerUser({}, registrationForm())).resolves.toEqual({
      error: "An account already exists for this email address.",
      reason: "account_exists"
    });

    expect(mocks.hashPassword).toHaveBeenCalledWith("Password123!");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("returns validation feedback without querying the database", async () => {
    const state = await registerUser({}, registrationForm({ password: "short" }));

    expect(state).toEqual({
      error: "Password must be at least 8 characters",
      reason: "invalid_input"
    });
    expect(mocks.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.user.create).not.toHaveBeenCalled();
  });

  it("does not hide unexpected database failures", async () => {
    mocks.user.findUnique.mockResolvedValue(null);
    mocks.user.create.mockRejectedValue(new Error("database unavailable"));

    await expect(registerUser({}, registrationForm())).rejects.toThrow("database unavailable");
  });
});
