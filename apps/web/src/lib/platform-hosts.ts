const FALLBACK_ROOT_DOMAIN = "vfurst.reyuugames.com";

export function normalizeHostname(hostname: string) {
  return hostname.split(":")[0]?.trim().toLowerCase() ?? "";
}

function hostnameFromUrlOrHost(value: string | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return normalizeHostname(url.hostname);
  } catch {
    return normalizeHostname(trimmed.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
  }
}

export function getRootDomain() {
  return hostnameFromUrlOrHost(process.env.NEXT_PUBLIC_ROOT_DOMAIN) || FALLBACK_ROOT_DOMAIN;
}

export function getPlatformHostnames() {
  const rootDomain = getRootDomain();
  const hostnames = new Set(["localhost", "127.0.0.1", rootDomain, `app.${rootDomain}`]);

  for (const value of [process.env.NEXT_PUBLIC_APP_URL, process.env.AUTH_URL, process.env.VFURST_LAUNCH_URL]) {
    const hostname = hostnameFromUrlOrHost(value);

    if (hostname) {
      hostnames.add(hostname);
    }
  }

  return hostnames;
}

export function isPlatformHostname(hostname: string) {
  return getPlatformHostnames().has(normalizeHostname(hostname));
}

export function isPlatformDomain(hostname: string) {
  const normalized = normalizeHostname(hostname);
  const rootDomain = getRootDomain();

  return normalized === rootDomain || normalized.endsWith(`.${rootDomain}`);
}
