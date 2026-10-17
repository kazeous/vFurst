export const SENSITIVE_QUERY_KEYS = ["token", "code", "state", "id_token_hint", "logout_token"] as const;

const FILTERED = "[Filtered]";
const SENSITIVE_KEYS = new Set<string>(SENSITIVE_QUERY_KEYS);
const INVITATION_TOKEN_SEGMENT = /(\/invitations\/)[^/?#]+/g;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const BREADCRUMB_URL_KEYS = ["url", "from", "to"] as const;
// OpenTelemetry HTTP attributes that Sentry copies into transaction span data.
const SPAN_URL_KEYS = ["url", "http.url", "http.target", "http.query", "url.full", "url.path", "url.query"] as const;

type QueryParams = string | Array<[string, string]> | Record<string, string>;

type ScrubbableEvent = {
  transaction?: unknown;
  request?: { url?: unknown; query_string?: unknown; headers?: Record<string, unknown> };
  breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
  contexts?: { trace?: { data?: Record<string, unknown> } };
  spans?: Array<{ description?: unknown; data?: Record<string, unknown> }>;
};

function scrubStringValues(data: Record<string, unknown> | undefined, keys: readonly string[]) {
  if (!data) {
    return;
  }
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string") {
      data[key] = scrubSensitiveUrl(value);
    }
  }
}

function scrubQueryString(query: string): string {
  const params = new URLSearchParams(query);
  if (![...params.keys()].some((key) => SENSITIVE_KEYS.has(key))) {
    return query;
  }
  const scrubbed = new URLSearchParams();
  for (const [key, value] of params) {
    scrubbed.append(key, SENSITIVE_KEYS.has(key) ? FILTERED : value);
  }
  return scrubbed.toString();
}

function scrubQueryParams(query: QueryParams): QueryParams {
  if (typeof query === "string") {
    return scrubQueryString(query);
  }
  if (Array.isArray(query)) {
    return query.map(([key, value]) => [key, SENSITIVE_KEYS.has(key) ? FILTERED : value]);
  }
  return Object.fromEntries(
    Object.entries(query).map(([key, value]) => [key, SENSITIVE_KEYS.has(key) ? FILTERED : value])
  );
}

/**
 * Replaces one-time tokens and OAuth values in a URL, a relative path, or a bare query string:
 * the values of SENSITIVE_QUERY_KEYS and the token segment of /invitations/<token>.
 */
export function scrubSensitiveUrl(value: string): string {
  const hashIndex = value.indexOf("#");
  const beforeHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : value.slice(hashIndex);
  const queryIndex = beforeHash.indexOf("?");

  if (queryIndex === -1) {
    const isBareQuery = beforeHash.includes("=") && !beforeHash.startsWith("/") && !URL_SCHEME.test(beforeHash);
    if (isBareQuery) {
      return scrubQueryString(beforeHash) + hash;
    }
    return beforeHash.replace(INVITATION_TOKEN_SEGMENT, `$1${FILTERED}`) + hash;
  }

  const path = beforeHash.slice(0, queryIndex).replace(INVITATION_TOKEN_SEGMENT, `$1${FILTERED}`);
  return `${path}?${scrubQueryString(beforeHash.slice(queryIndex + 1))}${hash}`;
}

/**
 * Scrubs the URL-bearing fields of a Sentry error or transaction event in place: the request,
 * referers, breadcrumbs, the transaction name, and the trace and span URL attributes.
 */
export function scrubSentryEventUrls<T extends object>(event: T): T {
  const scrubbable = event as ScrubbableEvent;
  const { request, breadcrumbs, contexts, spans } = scrubbable;

  if (typeof scrubbable.transaction === "string") {
    scrubbable.transaction = scrubSensitiveUrl(scrubbable.transaction);
  }

  if (request) {
    if (typeof request.url === "string") {
      request.url = scrubSensitiveUrl(request.url);
    }
    if (request.query_string !== undefined && request.query_string !== null) {
      request.query_string = scrubQueryParams(request.query_string as QueryParams);
    }
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      if (name.toLowerCase() === "referer" && typeof value === "string" && request.headers) {
        request.headers[name] = scrubSensitiveUrl(value);
      }
    }
  }

  for (const breadcrumb of breadcrumbs ?? []) {
    scrubStringValues(breadcrumb.data, BREADCRUMB_URL_KEYS);
  }

  scrubStringValues(contexts?.trace?.data, SPAN_URL_KEYS);
  for (const span of spans ?? []) {
    if (typeof span.description === "string") {
      span.description = scrubSensitiveUrl(span.description);
    }
    scrubStringValues(span.data, SPAN_URL_KEYS);
  }

  return event;
}
