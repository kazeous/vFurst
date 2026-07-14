export const DEFAULT_PRODUCTION_DB_CONNECTION_LIMIT = 4;
export const DEFAULT_DB_POOL_TIMEOUT_SECONDS = 20;

type PrismaConnectionPolicyInput = {
  databaseUrl: string | undefined;
  nodeEnv?: string;
  connectionLimit?: string;
  poolTimeoutSeconds?: string;
};

function positiveInteger(name: string, value: string | undefined, fallback?: number) {
  const normalized = value?.trim();

  if (!normalized) {
    return fallback;
  }

  if (!/^\d+$/.test(normalized) || Number(normalized) < 1 || !Number.isSafeInteger(Number(normalized))) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return Number(normalized);
}

export function createPrismaDatasourceUrl({
  databaseUrl,
  nodeEnv,
  connectionLimit,
  poolTimeoutSeconds
}: PrismaConnectionPolicyInput) {
  if (!databaseUrl) {
    return undefined;
  }

  const url = new URL(databaseUrl);

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must use the postgres: or postgresql: protocol.");
  }

  const configuredLimit = connectionLimit?.trim() || url.searchParams.get("connection_limit") || undefined;
  const limit = positiveInteger(
    "VFURST_DB_CONNECTION_LIMIT",
    configuredLimit,
    nodeEnv === "production" ? DEFAULT_PRODUCTION_DB_CONNECTION_LIMIT : undefined
  );
  const configuredPoolTimeout = poolTimeoutSeconds?.trim() || url.searchParams.get("pool_timeout") || undefined;
  const poolTimeout = positiveInteger(
    "VFURST_DB_POOL_TIMEOUT_SECONDS",
    configuredPoolTimeout,
    limit ? DEFAULT_DB_POOL_TIMEOUT_SECONDS : undefined
  );

  if (limit) {
    url.searchParams.set("connection_limit", String(limit));
  }

  if (poolTimeout) {
    url.searchParams.set("pool_timeout", String(poolTimeout));
  }

  return url.toString();
}
