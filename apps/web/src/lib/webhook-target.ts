import { isIP } from "node:net";

const BLOCKED_HOST_SUFFIXES = [".internal", ".local", ".localhost", ".home.arpa"];

function normalizedHostname(url: URL) {
  return url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}

export function normalizeWebhookTarget(rawUrl: string) {
  let url: URL;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Webhook endpoint must be a valid URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Webhook endpoints must use HTTPS.");
  }

  if (url.username || url.password) {
    throw new Error("Webhook endpoint URLs cannot contain credentials.");
  }

  const hostname = normalizedHostname(url);

  if (
    !hostname ||
    hostname === "localhost" ||
    isIP(hostname) !== 0 ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new Error("Webhook endpoints must use a public DNS hostname.");
  }

  url.hash = "";
  return url.toString();
}
