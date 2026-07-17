import {
  AUTHORIZATION_TRANSACTION_KEY_BYTES,
  MAX_TENANT_SESSION_SECRET_BYTES,
  MIN_TENANT_SESSION_SECRET_BYTES
} from "@vfurst/auth";
import type { TenantWebEnvironment } from "./environment";

function decodeBase64UrlSecret(
  value: string,
  minimumBytes: number,
  maximumBytes: number,
  label: string
) {
  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.toString("base64url") !== value ||
    decoded.byteLength < minimumBytes ||
    decoded.byteLength > maximumBytes
  ) {
    throw new Error(`${label} is not a canonical base64url secret of the required length.`);
  }
  return decoded;
}

export function getTenantAuthRuntime(environment: TenantWebEnvironment) {
  return Object.freeze({
    audience: "tenant-web" as const,
    clientId: environment.authClientId,
    callbackUrl: new URL("/auth/callback", environment.consoleUrl).toString(),
    transactionKey: decodeBase64UrlSecret(
      environment.authTransactionKeyBase64Url,
      AUTHORIZATION_TRANSACTION_KEY_BYTES,
      AUTHORIZATION_TRANSACTION_KEY_BYTES,
      "Authorization transaction key"
    ),
    tenantSessionSecret: decodeBase64UrlSecret(
      environment.tenantSessionSecretBase64Url,
      MIN_TENANT_SESSION_SECRET_BYTES,
      MAX_TENANT_SESSION_SECRET_BYTES,
      "Tenant session secret"
    ),
    managerIdentityPublicKeys: new Map(Object.entries(environment.managerIdentityPublicKeys))
  });
}
