export function safeReturnTo(value: string | string[] | undefined, fallback = "/dashboard") {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (
    !candidate ||
    candidate.length > 2048 ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\") ||
    Array.from(candidate).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    return fallback;
  }

  return candidate;
}
