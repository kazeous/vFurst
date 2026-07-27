export function getPortalRootFromPathname(pathname: string, slug: string) {
  const centralRoot = `/${slug}`;

  if (pathname === centralRoot || pathname.startsWith(`${centralRoot}/`)) {
    return centralRoot;
  }

  return "";
}

export function getPortalHref(pathname: string, slug: string, suffix = "") {
  return `${getPortalRootFromPathname(pathname, slug)}${suffix}` || "/";
}
