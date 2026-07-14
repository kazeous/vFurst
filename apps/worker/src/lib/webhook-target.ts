import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type ResolvedAddress = {
  address: string;
  family: number;
};

export type WebhookTargetResolver = (hostname: string) => Promise<readonly ResolvedAddress[]>;

const BLOCKED_HOST_SUFFIXES = [".internal", ".local", ".localhost", ".home.arpa"];

function normalizedHostname(url: URL) {
  return url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
}

function isNonPublicIpv4(address: string) {
  const octets = address.split(".").map(Number);

  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }

  const [a, b, c] = octets as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function ipv6Value(address: string) {
  let normalized = address.toLowerCase();

  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const ipv4 = normalized.slice(lastColon + 1);
    const octets = ipv4.split(".").map(Number);

    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return null;
    }

    const [a, b, c, d] = octets as [number, number, number, number];
    normalized = `${normalized.slice(0, lastColon)}:${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }

  const halves = normalized.split("::");

  if (halves.length > 2) {
    return null;
  }

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;

  if (missing < 0 || (halves.length === 1 && missing !== 0)) {
    return null;
  }

  const groups = [...head, ...Array.from({ length: missing }, () => "0"), ...tail];

  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) {
    return null;
  }

  return groups.reduce((value, group) => (value << 16n) | BigInt(`0x${group}`), 0n);
}

function isNonPublicAddress(address: string) {
  const family = isIP(address);

  if (family === 4) {
    return isNonPublicIpv4(address);
  }

  if (family !== 6) {
    return true;
  }

  const value = ipv6Value(address);

  if (value == null) {
    return true;
  }

  if (value >> 32n === 0xffffn) {
    const mapped = Number(value & 0xffffffffn);
    return isNonPublicIpv4(
      [mapped >>> 24, (mapped >>> 16) & 255, (mapped >>> 8) & 255, mapped & 255].join(".")
    );
  }

  const firstGroup = Number(value >> 112n);
  return (
    value === 0n ||
    value === 1n ||
    (firstGroup & 0xfe00) === 0xfc00 ||
    (firstGroup & 0xffc0) === 0xfe80 ||
    (firstGroup & 0xff00) === 0xff00 ||
    value >> 96n === 0x20010db8n
  );
}

const defaultResolver: WebhookTargetResolver = async (hostname) => lookup(hostname, { all: true, verbatim: true });

export async function resolveWebhookTarget(rawUrl: string, resolver: WebhookTargetResolver = defaultResolver) {
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

  const addresses = await resolver(hostname);

  if (addresses.length === 0 || addresses.some((candidate) => isNonPublicAddress(candidate.address))) {
    throw new Error("Webhook endpoint DNS must resolve only to public IP addresses.");
  }

  url.hash = "";
  return {
    address: addresses[0]!.address,
    hostname,
    url
  };
}
