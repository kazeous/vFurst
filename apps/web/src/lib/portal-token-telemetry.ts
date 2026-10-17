/** Both tenant-host and central-path forms of the setup/reset page. */
export function isPortalTokenPage(href: string, base: string): boolean {
  try {
    const pathname = decodeURIComponent(new URL(href, base).pathname);
    return /^(?:\/[^/]+)?\/set-password\/?$/.test(pathname);
  } catch {
    // An unparseable navigation must not accidentally enable telemetry.
    return true;
  }
}
