import { scrubSensitiveUrl } from "./sentry-url-scrub";

/** Setup/reset pages and credential-bearing staff/portal navigation, including return URLs. */
export function isPortalTokenPage(href: string, base: string): boolean {
  try {
    const url = new URL(href, base);
    const pathname = decodeURIComponent(url.pathname);
    const location = pathname + url.search;
    return /^(?:\/[^/]+)?\/set-password\/?$/.test(pathname) || scrubSensitiveUrl(location) !== location;
  } catch {
    // An unparseable navigation must not accidentally enable telemetry.
    return true;
  }
}
