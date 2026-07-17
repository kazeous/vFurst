import { authorizationCodeExchangeRequestSchema, authorizationCodeExchangeResponseSchema } from "@vfurst/contracts";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireIdentityProtocolEnv } from "@/lib/env";
import {
  createAuthorizationCodeService,
  hasValidServiceBearer,
  invalidProtocolRequest,
  mapProtocolError,
  readBoundedJson,
  unauthorizedServiceError
} from "@/lib/identity-protocol";

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

    const body = authorizationCodeExchangeRequestSchema.safeParse(await readBoundedJson(request));
    if (!body.success) {
      const error = invalidProtocolRequest();
      return noStoreJson(error.body, error.status);
    }

    const exchanged = await createAuthorizationCodeService(env).exchange(body.data);
    const response = authorizationCodeExchangeResponseSchema.parse({
      tokenType: "vfurst_identity_assertion",
      identityAssertion: exchanged.identityAssertion
    });
    return noStoreJson(response, 200);
  } catch (error) {
    const mapped = mapProtocolError(error);
    return noStoreJson(mapped.body, mapped.status);
  }
}
