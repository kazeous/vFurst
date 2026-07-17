import { PrismaClient } from "@prisma/client";
import { createPrismaDatasourceUrl } from "./connection-policy.js";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const datasourceUrl = createPrismaDatasourceUrl({
    databaseUrl: process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    connectionLimit: process.env.VFURST_DB_CONNECTION_LIMIT,
    poolTimeoutSeconds: process.env.VFURST_DB_POOL_TIMEOUT_SECONDS
  });

  return new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = prisma;

export * from "@prisma/client";
export * from "./authorization-codes.js";
export * from "./connection-policy.js";
export * from "./control-plane-outbox.js";
export * from "./fee-report.js";
export * from "./payment-attempts.js";
