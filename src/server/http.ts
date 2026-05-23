import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export function forbidden(message = "Forbidden"): never {
  throw new HttpError(403, message);
}

export function notFound(message = "Not found"): never {
  throw new HttpError(404, message);
}

export function unauthorized(message = "Unauthorized"): never {
  throw new HttpError(401, message);
}

export async function parseJsonBody<T>(request: Request, parser: { parse: (value: unknown) => T }) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }

  return parser.parse(payload);
}

export function handleRouteError(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "PrismaClientInitializationError"
  ) {
    return NextResponse.json({ error: "Database is unavailable. Start Postgres and run migrations." }, { status: 503 });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Validation failed", issues: error.flatten() }, { status: 400 });
  }

  console.error(error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
