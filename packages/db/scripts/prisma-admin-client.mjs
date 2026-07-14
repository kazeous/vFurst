import { PrismaClient } from "@prisma/client";
import process from "node:process";

export function createAdminPrismaClient() {
  const datasourceUrl = process.env.DIRECT_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();

  return new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);
}
