import { prisma } from "@vfurst/db";
import { Redis } from "ioredis";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type CheckResult = "ok" | "down";
type Probe = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
};

// Hard ceiling so a slow dependency cannot stall the probe past Coolify's
// default 5s timeout.
const PROBE_TIMEOUT_MS = 1500;

async function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeout = setTimeout(() => resolve(fallback), PROBE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    const rows = await withTimeout(prisma.$queryRaw<Array<{ ok: number }>>`SELECT 1 AS ok`, []);
    return rows.length === 1 && rows[0]?.ok === 1 ? "ok" : "down";
  } catch {
    return "down";
  }
}

async function checkRedis(): Promise<CheckResult> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return "down";
  }
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });
  try {
    await withTimeout(client.connect(), undefined);
    const response = await withTimeout(client.ping(), "");
    return response === "PONG" ? "ok" : "down";
  } catch {
    return "down";
  } finally {
    client.disconnect();
  }
}

export async function GET(): Promise<Response> {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const ok = database === "ok" && redis === "ok";
  const probe: Probe = {
    ok,
    status: ok ? 200 : 503,
    body: {
      ok,
      database,
      redis,
      service: "web",
      commit: process.env.COOLIFY_GIT_COMMIT_SHA ?? "unknown"
    }
  };
  return Response.json(probe.body, { status: probe.status });
}
