import { createHash } from "node:crypto";
import { prisma, type ApiKey } from "@vfurst/db";
import {
  API_RATE_LIMIT_PER_MINUTE,
  RATE_LIMIT_FAILURE_MODES,
  RATE_LIMIT_WINDOW_MS,
  RateLimitUnavailableError,
  applyFixedWindowRateLimit,
  rateLimitResponse,
  rateLimitUnavailableResponse
} from "../rate-limit";

export type ApiContext = {
  apiKey: ApiKey;
  rate: {
    limit: number;
    remaining: number;
    resetAt: number;
  };
};

export function hashApiKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function jsonError(message: string, status = 400, code = "bad_request") {
  return Response.json(
    {
      error: {
        code,
        message
      }
    },
    { status }
  );
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const [scheme, token] = authorization.split(/\s+/, 2);

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function requireApiKey(request: Request, scope: string): Promise<ApiContext | Response> {
  const token = bearerToken(request);

  if (!token) {
    return jsonError("Missing Bearer API key.", 401, "unauthorized");
  }

  const keyHash = hashApiKey(token);
  let rate;
  try {
    rate = await applyFixedWindowRateLimit({
      namespace: "api-key",
      key: keyHash,
      limit: API_RATE_LIMIT_PER_MINUTE,
      windowMs: RATE_LIMIT_WINDOW_MS,
      failureMode: RATE_LIMIT_FAILURE_MODES.api
    });
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) {
      return rateLimitUnavailableResponse();
    }
    throw error;
  }

  if (rate.limited) {
    return rateLimitResponse(rate);
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: {
      keyHash
    },
    include: {
      org: {
        select: {
          status: true
        }
      }
    }
  });

  if (!apiKey) {
    return jsonError("Invalid API key.", 401, "unauthorized");
  }

  if (apiKey.org.status !== "ACTIVE") {
    return jsonError("This organization is not active.", 403, "organization_inactive");
  }

  if (!apiKey.scopes.includes("*") && !apiKey.scopes.includes(scope)) {
    return jsonError(`API key is missing the ${scope} scope.`, 403, "forbidden");
  }

  await prisma.apiKey.update({
    where: {
      id: apiKey.id
    },
    data: {
      lastUsedAt: new Date()
    }
  });

  return {
    apiKey,
    rate: {
      limit: rate.limit,
      remaining: rate.remaining,
      resetAt: rate.resetAt
    }
  };
}

export function withRateHeaders(response: Response, context: ApiContext) {
  response.headers.set("x-ratelimit-limit", String(context.rate.limit));
  response.headers.set("x-ratelimit-remaining", String(context.rate.remaining));
  response.headers.set("x-ratelimit-reset", String(Math.ceil(context.rate.resetAt / 1000)));
  return response;
}

export function parsePagination(request: Request) {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") ?? 25) || 25));

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

export function paginated<T>(data: T[], total: number, page: number, pageSize: number) {
  return {
    data,
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize))
    }
  };
}
