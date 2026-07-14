import { describe, expect, it } from "vitest";
import {
  DEFAULT_DB_POOL_TIMEOUT_SECONDS,
  DEFAULT_PRODUCTION_DB_CONNECTION_LIMIT,
  createPrismaDatasourceUrl
} from "./connection-policy.js";

describe("createPrismaDatasourceUrl", () => {
  it("bounds an otherwise unconfigured production pool", () => {
    const result = new URL(
      createPrismaDatasourceUrl({
        databaseUrl: "postgresql://user:pass@db.example/vfurst?schema=public&pgbouncer=true",
        nodeEnv: "production"
      })!
    );

    expect(result.searchParams.get("connection_limit")).toBe(String(DEFAULT_PRODUCTION_DB_CONNECTION_LIMIT));
    expect(result.searchParams.get("pool_timeout")).toBe(String(DEFAULT_DB_POOL_TIMEOUT_SECONDS));
    expect(result.searchParams.get("schema")).toBe("public");
    expect(result.searchParams.get("pgbouncer")).toBe("true");
  });

  it("uses explicit environment policy as the authoritative pool configuration", () => {
    const result = new URL(
      createPrismaDatasourceUrl({
        databaseUrl: "postgresql://user:pass@db.example/vfurst?connection_limit=9&pool_timeout=10",
        nodeEnv: "production",
        connectionLimit: "3",
        poolTimeoutSeconds: "15"
      })!
    );

    expect(result.searchParams.get("connection_limit")).toBe("3");
    expect(result.searchParams.get("pool_timeout")).toBe("15");
  });

  it("does not invent a development pool policy when none is configured", () => {
    const result = new URL(
      createPrismaDatasourceUrl({
        databaseUrl: "postgresql://user:pass@localhost/vfurst?schema=public",
        nodeEnv: "development"
      })!
    );

    expect(result.searchParams.has("connection_limit")).toBe(false);
    expect(result.searchParams.has("pool_timeout")).toBe(false);
  });

  it("rejects malformed limits and non-Postgres URLs", () => {
    expect(() =>
      createPrismaDatasourceUrl({
        databaseUrl: "postgresql://user:pass@db.example/vfurst",
        nodeEnv: "production",
        connectionLimit: "0"
      })
    ).toThrow("VFURST_DB_CONNECTION_LIMIT must be a positive integer.");

    expect(() =>
      createPrismaDatasourceUrl({
        databaseUrl: "mysql://user:pass@db.example/vfurst",
        nodeEnv: "production"
      })
    ).toThrow("DATABASE_URL must use the postgres: or postgresql: protocol.");
  });
});
