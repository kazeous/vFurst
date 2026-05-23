import "server-only";
import { HttpError } from "@/server/http";

const buckets = new Map<string, number[]>();

export function assertRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (buckets.get(key) ?? []).filter((timestamp) => timestamp > cutoff);

  if (recent.length >= limit) {
    throw new HttpError(429, "Too many requests. Please wait and try again.");
  }

  recent.push(now);
  buckets.set(key, recent);
}
