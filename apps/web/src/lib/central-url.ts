import { safeReturnTo } from "@/lib/return-to";

export function getCentralAppUrl(pathname = "/") {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
  return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

export function getCentralPortalPath(orgSlug: string, suffix = "") {
  const normalizedSuffix = suffix && !suffix.startsWith("/") ? `/${suffix}` : suffix;
  return `/${encodeURIComponent(orgSlug)}${normalizedSuffix}`;
}

export function getCentralLoginUrl(returnTo: string) {
  const url = new URL("/login", getCentralAppUrl());
  url.searchParams.set("returnTo", safeReturnTo(returnTo, "/account"));
  return url.toString();
}

export function getCentralRegistrationUrl(returnTo: string) {
  const url = new URL("/register", getCentralAppUrl());
  url.searchParams.set("returnTo", safeReturnTo(returnTo, "/account"));
  return url.toString();
}
