import { describe, expect, it } from "vitest";
import { envSchema } from "@/server/env.schema";

describe("server environment schema", () => {
  it("accepts the required Phase 1 environment variables", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/vfurst?schema=public",
      AUTH_SECRET: "abcdefghijklmnopqrstuvwxyz123456",
      AUTH_URL: "http://localhost:3000"
    });

    expect(result.success).toBe(true);
  });

  it("rejects missing or weak secrets", () => {
    const result = envSchema.safeParse({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/vfurst?schema=public",
      AUTH_SECRET: "short",
      AUTH_URL: "http://localhost:3000"
    });

    expect(result.success).toBe(false);
  });
});
