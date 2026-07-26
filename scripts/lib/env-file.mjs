import { readFileSync } from "node:fs";

const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

function stripQuotes(rawValue) {
  const value = rawValue.trim();

  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];

    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }

  return value;
}

/** Parse `KEY=value` lines into a plain object. Comments and blanks are ignored. */
export function parseEnvText(text) {
  const values = {};

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) {
      continue;
    }

    const match = ASSIGNMENT.exec(line);

    if (match) {
      values[match[1]] = stripQuotes(match[2]);
    }
  }

  return values;
}

/** Read and parse an env file. Returns null when the file does not exist. */
export function readEnvFile(path) {
  try {
    return parseEnvText(readFileSync(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

/**
 * Resolve effective values for an application: variables already present in the
 * real process environment always win, matching dotenv precedence, so a
 * deployed platform's configuration is never overridden by a checked-in file.
 */
export function resolveAppEnv(filePaths, processEnv = process.env) {
  const resolved = {};

  for (const path of filePaths) {
    const parsed = readEnvFile(path);

    if (parsed) {
      for (const [key, value] of Object.entries(parsed)) {
        if (resolved[key] === undefined) {
          resolved[key] = value;
        }
      }
    }
  }

  for (const [key, value] of Object.entries(processEnv)) {
    if (value !== undefined && value !== "") {
      resolved[key] = value;
    }
  }

  return resolved;
}

/**
 * True when a value is still an unreplaced template placeholder.
 *
 * Matches the two forms the templates use — `sk_test_replace_me` and
 * `replace-with-base64-encoded-32-byte-key` — without flagging a legitimate
 * secret that merely contains the substring "replace".
 */
export function isPlaceholder(value) {
  return typeof value === "string" && /replace[-_](me|with)\b/i.test(value);
}
