import { describe, expect, it } from "vitest";
import { PLATFORM_MANAGER_ENV_NAMES, parsePlatformManagerEnv } from "./env.js";

describe("platform-manager environment", () => {
  it("documents the runtime-specific environment names", () => {
    expect(PLATFORM_MANAGER_ENV_NAMES).toEqual({
      managerUrl: "NEXT_PUBLIC_PLATFORM_MANAGER_URL",
      rootDomain: "NEXT_PUBLIC_ROOT_DOMAIN",
      authUrl: "AUTH_URL",
      authSecret: "AUTH_SECRET",
      databaseUrl: "DATABASE_URL",
      redisUrl: "REDIS_URL"
    });
  });

  it("uses build-safe local defaults without production credentials", () => {
    expect(parsePlatformManagerEnv({})).toEqual({
      managerUrl: "http://localhost:3000",
      rootDomain: "localhost",
      authUrl: "http://localhost:3000",
      authSecret: undefined,
      databaseUrl: undefined,
      redisUrl: undefined
    });
  });

  it("normalizes a complete deployment configuration", () => {
    expect(
      parsePlatformManagerEnv({
        NEXT_PUBLIC_PLATFORM_MANAGER_URL: "https://vfurst.example/",
        NEXT_PUBLIC_ROOT_DOMAIN: "VFUrst.Example.",
        AUTH_URL: "https://vfurst.example",
        AUTH_SECRET: " manager-secret ",
        DATABASE_URL: "postgresql://manager:secret@db.example:5432/vfurst",
        REDIS_URL: "rediss://cache.example:6379"
      })
    ).toEqual({
      managerUrl: "https://vfurst.example",
      rootDomain: "vfurst.example",
      authUrl: "https://vfurst.example",
      authSecret: "manager-secret",
      databaseUrl: "postgresql://manager:secret@db.example:5432/vfurst",
      redisUrl: "rediss://cache.example:6379"
    });
  });

  it.each([
    [{ NEXT_PUBLIC_PLATFORM_MANAGER_URL: "vfurst.example" }, /absolute HTTP\(S\) URL/],
    [{ NEXT_PUBLIC_PLATFORM_MANAGER_URL: "ftp://vfurst.example" }, /HTTP or HTTPS/],
    [{ NEXT_PUBLIC_PLATFORM_MANAGER_URL: "https://vfurst.example/path" }, /must be an origin/],
    [{ NEXT_PUBLIC_ROOT_DOMAIN: "https://vfurst.example" }, /must be a hostname/],
    [{ AUTH_URL: "https://auth.example" }, /must match the platform-manager origin/],
    [{ DATABASE_URL: "mysql://db.example/vfurst" }, /unsupported protocol/],
    [{ REDIS_URL: "http://cache.example" }, /unsupported protocol/]
  ])("rejects malformed supplied configuration %#", (input, expected) => {
    expect(() => parsePlatformManagerEnv(input)).toThrow(expected);
  });
});
