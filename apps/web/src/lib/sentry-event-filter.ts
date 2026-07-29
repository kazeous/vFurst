const NEXT_HTTP_ERROR_FALLBACK_CODE = "NEXT_HTTP_ERROR_FALLBACK";
const EXPECTED_HTTP_ACCESS_STATUSES = new Set(["401", "403", "404"]);

/**
 * Next implements unauthorized(), forbidden(), and notFound() by throwing an
 * internal error that the App Router catches and turns into the matching HTTP
 * response. These are expected navigation interrupts, not application faults.
 */
export function isExpectedNextHttpAccessFallback(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return false;
  }

  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") {
    return false;
  }

  const [code, status, unexpectedPart] = digest.split(";");
  return (
    unexpectedPart === undefined &&
    code === NEXT_HTTP_ERROR_FALLBACK_CODE &&
    EXPECTED_HTTP_ACCESS_STATUSES.has(status)
  );
}

export function filterExpectedNextHttpAccessFallback<Event>(
  event: Event,
  hint: { originalException?: unknown }
): Event | null {
  return isExpectedNextHttpAccessFallback(hint.originalException) ? null : event;
}
