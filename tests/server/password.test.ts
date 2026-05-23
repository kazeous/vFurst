import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("password hashing", () => {
  it("verifies the original password and rejects a different password", async () => {
    const { hashPassword, verifyPassword } = await import("@/server/password");
    const hash = await hashPassword("very-secure-password");

    expect(hash).toMatch(/^scrypt:/);
    await expect(verifyPassword("very-secure-password", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
