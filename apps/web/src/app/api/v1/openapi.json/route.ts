import { getOpenApiSpec } from "@/lib/api/openapi";

export function GET() {
  return Response.json(getOpenApiSpec());
}
