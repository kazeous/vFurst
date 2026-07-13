const RESERVED_DASHBOARD_RESOURCE_SEGMENTS = new Set(["new"]);

function getResourceId(pathname: string, resource: "events" | "organizations") {
  const candidate = pathname.match(new RegExp(`^/dashboard/${resource}/([^/]+)`))?.[1];

  if (!candidate || RESERVED_DASHBOARD_RESOURCE_SEGMENTS.has(candidate)) {
    return undefined;
  }

  return candidate;
}

export function getDashboardEventId(pathname: string) {
  return getResourceId(pathname, "events");
}

export function getDashboardOrganizationId(pathname: string) {
  return getResourceId(pathname, "organizations");
}

export function isDashboardResourceId(segment: string | undefined): segment is string {
  return Boolean(segment && !RESERVED_DASHBOARD_RESOURCE_SEGMENTS.has(segment));
}
