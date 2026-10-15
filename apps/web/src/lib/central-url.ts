export function getCentralAppUrl(pathname = "/") {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
  return new URL(pathname, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}
