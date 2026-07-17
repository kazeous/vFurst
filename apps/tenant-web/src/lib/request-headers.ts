export const VFURST_INTERNAL_HEADER_PREFIX = "x-vfurst-";

export function isVfurstInternalHeader(name: string) {
  return name.trim().toLowerCase().startsWith(VFURST_INTERNAL_HEADER_PREFIX);
}

/** Returns a new Headers object so middleware never mutates the request input. */
export function scrubVfurstInternalHeaders(input: HeadersInit) {
  const headers = new Headers(input);
  for (const name of [...headers.keys()]) {
    if (isVfurstInternalHeader(name)) headers.delete(name);
  }
  return headers;
}
