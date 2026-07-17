import { AUTH_COOKIE_NAMES } from "@vfurst/auth/core";
import { AUTHORIZATION_CODE_AUDIENCES } from "@vfurst/contracts";

export const PLATFORM_MANAGER_RUNTIME = "platform-manager";

export function createPlatformManagerHealth(timestamp = new Date()) {
  return Object.freeze({
    status: "ok" as const,
    runtime: PLATFORM_MANAGER_RUNTIME,
    plane: "control" as const,
    identityIssuer: AUTHORIZATION_CODE_AUDIENCES[0],
    sessionCookieScope: AUTH_COOKIE_NAMES.managerSession.startsWith("__Host-") ? ("host-only" as const) : ("invalid" as const),
    timestamp: timestamp.toISOString()
  });
}
