import { AUTH_COOKIE_NAMES, HOST_ONLY_SESSION_COOKIE_POLICY } from "@vfurst/auth/core";

export const MANAGER_SESSION_COOKIE = Object.freeze({
  name: AUTH_COOKIE_NAMES.managerSession,
  options: HOST_ONLY_SESSION_COOKIE_POLICY
});

export function managerGoogleProviderOptions(clientId: string, clientSecret: string) {
  return Object.freeze({ clientId, clientSecret });
}
