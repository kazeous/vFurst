import { revokeIdentitySession } from "@/lib/identity-session";
import { identitySessionRevocationResponseSchema } from "@vfurst/contracts";
import { requireIdentityProtocolEnv } from "@/lib/env";
import {
  hasValidServiceBearer,
  mapProtocolError,
  parseIdentitySessionRevocation,
  readBoundedJson,
  unauthorizedServiceError
} from "@/lib/identity-protocol";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", Pragma: "no-cache" }
  });
}

export async function POST(request: NextRequest) {
  try {
    const env = requireIdentityProtocolEnv();
    if (!hasValidServiceBearer(request.headers.get("authorization"), env.identityServiceSecret)) {
      const error = unauthorizedServiceError();
      return noStoreJson(error.body, error.status);
    }

    const body = parseIdentitySessionRevocation(await readBoundedJson(request));
    const revoked = await revokeIdentitySession(body.identitySessionId);
    return noStoreJson(identitySessionRevocationResponseSchema.parse({ revoked }), 200);
  } catch (error) {
    const mapped = mapProtocolError(error);
    return noStoreJson(mapped.body, mapped.status);
  }
}
