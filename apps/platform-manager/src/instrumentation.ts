import { reportPlatformManagerRequestError } from "@/lib/observability";

export async function register() {
  // Request-owned server modules validate their own configuration. Keeping
  // instrumentation dependency-free prevents Next's edge/client fallback
  // compiler from pulling node:crypto into an incompatible bundle.
}

export const onRequestError = reportPlatformManagerRequestError;
