import "server-only";
import { paginationQuerySchema } from "@/shared/schemas/query";

export function parsePagination(searchParams: URLSearchParams) {
  const parsed = paginationQuerySchema.parse(Object.fromEntries(searchParams.entries()));
  return {
    ...parsed,
    skip: (parsed.page - 1) * parsed.pageSize,
    take: parsed.pageSize
  };
}
