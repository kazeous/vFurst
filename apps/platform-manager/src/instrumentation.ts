import { getPlatformManagerEnv } from "@/lib/env";
import { reportPlatformManagerRequestError } from "@/lib/observability";

export async function register() {
  // Missing production infrastructure values are valid while this remains a
  // non-cutover shell; malformed values that are present still fail clearly.
  getPlatformManagerEnv();
}

export const onRequestError = reportPlatformManagerRequestError;
