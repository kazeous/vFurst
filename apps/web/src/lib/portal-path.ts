export function getPortalRootFromPathname(pathname: string, subdomain: string) {
  const centralRoot = `/${subdomain}`;

  if (pathname === centralRoot || pathname.startsWith(`${centralRoot}/`)) {
    return centralRoot;
  }

  return "";
}

export function getPortalHref(pathname: string, subdomain: string, suffix = "") {
  return `${getPortalRootFromPathname(pathname, subdomain)}${suffix}` || "/";
}
