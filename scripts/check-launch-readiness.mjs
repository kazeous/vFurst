import { readFile } from "node:fs/promises";
import process from "node:process";

const explicitEnv = new Set(
  Object.entries(process.env)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([name]) => name)
);
const ignoredDotEnvNames = new Set(["NODE_ENV"]);

const requiredFiles = [
  "apps/web/src/app/page.tsx",
  "apps/web/src/app/(marketing)/features/page.tsx",
  "apps/web/src/app/(marketing)/pricing/page.tsx",
  "apps/web/src/app/(marketing)/privacy/page.tsx",
  "apps/web/src/app/(marketing)/terms/page.tsx",
  "apps/web/src/app/(marketing)/dmca/page.tsx",
  "docs/launch/beta-program.md",
  "docs/launch/security-audit.md",
  "docs/launch/accessibility-audit.md",
  "docs/launch/performance-load-test.md",
  "packages/db/src/connection-policy.ts",
  "packages/db/src/connection-policy.test.ts",
  "apps/web/src/lib/redis-rate-limit.ts",
  "scripts/run-launch-load-proof.mjs",
  "tests/load/registration-checkin.k6.js",
  "tests/e2e/launch-critical-paths.spec.ts",
  "tests/e2e/launch-accessibility-smoke.spec.ts",
  "tests/e2e/stripe-webhook-security.spec.ts",
  "tests/e2e/shared-rate-limit.spec.ts"
];

const requiredEnv = [
  {
    name: "DATABASE_URL",
    type: "postgres-url"
  },
  {
    name: "DIRECT_DATABASE_URL",
    type: "direct-postgres-url"
  },
  {
    name: "REDIS_URL",
    type: "redis-url"
  },
  {
    name: "EMAIL_DELIVERY_ENCRYPTION_KEY",
    type: "base64-32-byte-key"
  },
  {
    name: "STRIPE_SECRET_KEY",
    type: "stripe-secret-key"
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    type: "stripe-webhook-secret"
  },
  {
    name: "NEXT_PUBLIC_SENTRY_DSN",
    type: "sentry-dsn"
  },
  {
    name: "SENTRY_DSN",
    type: "sentry-dsn"
  },
  {
    name: "SENTRY_ORG",
    type: "text"
  },
  {
    name: "SENTRY_PROJECT",
    type: "text"
  },
  {
    name: "SENTRY_AUTH_TOKEN",
    type: "text"
  },
  {
    name: "VFURST_DB_CONNECTION_LIMIT",
    type: "positive-integer"
  },
  {
    name: "VFURST_DB_POOL_TIMEOUT_SECONDS",
    type: "positive-integer"
  },
  {
    name: "VFURST_DB_CONNECTION_BUDGET",
    type: "positive-integer"
  },
  {
    name: "VFURST_WEB_REPLICAS",
    type: "positive-integer"
  },
  {
    name: "VFURST_WORKER_REPLICAS",
    type: "positive-integer"
  },
  {
    name: "VFURST_API_RATE_LIMIT_PER_MINUTE",
    type: "positive-integer"
  },
  {
    name: "VFURST_AUTH_RATE_LIMIT_PER_MINUTE",
    type: "positive-integer"
  },
  {
    name: "VFURST_PAYMENT_RATE_LIMIT_PER_MINUTE",
    type: "positive-integer"
  },
  {
    name: "VFURST_STRIPE_WEBHOOK_RATE_LIMIT_PER_MINUTE",
    type: "positive-integer"
  },
  {
    name: "VFURST_SEPAY_WEBHOOK_RATE_LIMIT_PER_MINUTE",
    type: "positive-integer"
  }
];

const marketingPaths = [
  {
    path: "/",
    expectedText: ["vFurst", "Manage registration, hotels, stores, vendors"]
  },
  {
    path: "/features",
    expectedText: ["One workspace for planning, selling, staffing, and launch day", "Production visibility is part of the workflow"]
  },
  {
    path: "/pricing",
    expectedText: ["Simple usage fees for events that move money", "Estimate platform fees"]
  },
  {
    path: "/privacy",
    expectedText: ["Privacy Policy", "Effective date: July 7, 2026"]
  },
  {
    path: "/terms",
    expectedText: ["Terms of Service", "Effective date: July 7, 2026"]
  },
  {
    path: "/dmca",
    expectedText: ["DMCA Takedown Policy", "Effective date: July 7, 2026"]
  }
];

function parseDotEnvLine(line) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const index = trimmed.indexOf("=");

  if (index < 1) {
    return null;
  }

  const name = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return { name, value };
}

async function loadDotEnv(path) {
  try {
    const content = await readFile(path, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const parsed = parseDotEnvLine(line);

      if (parsed && !explicitEnv.has(parsed.name) && !ignoredDotEnvNames.has(parsed.name)) {
        process.env[parsed.name] = parsed.value;
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function ok(message) {
  console.log(`PASS ${message}`);
}

function fail(failures, message) {
  failures.push(message);
  console.log(`FAIL ${message}`);
}

async function fileIncludes(path, text) {
  const content = await readFile(path, "utf8");
  return content.includes(text);
}

function isPlaceholderValue(value) {
  const normalized = value.trim().toLowerCase();

  return (
    !normalized ||
    normalized === "..." ||
    normalized === "example" ||
    normalized === "replace_me" ||
    normalized === "replace-me" ||
    normalized === "replace-with-real-value" ||
    normalized === "your-production-domain.example" ||
    normalized.includes("_replace_me") ||
    normalized.startsWith("replace-with-") ||
    normalized.startsWith("your-")
  );
}

function validateSentryDsn(name, value) {
  if (isPlaceholderValue(value)) {
    return `${name} is not configured.`;
  }

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return `${name} must be an HTTP(S) Sentry DSN.`;
    }

    if (!url.hostname || !url.username) {
      return `${name} does not look like a Sentry DSN.`;
    }
  } catch {
    return `${name} must be a valid Sentry DSN URL.`;
  }

  return null;
}

function validateTextEnv(name, value) {
  if (isPlaceholderValue(value)) {
    return `${name} is not configured.`;
  }

  return null;
}

function validateStripeSecretKey(name, value) {
  if (isPlaceholderValue(value)) {
    return `${name} is not configured.`;
  }

  if ((!value.startsWith("sk_test_") && !value.startsWith("sk_live_")) || value.length < 20) {
    return `${name} does not look like a Stripe secret key.`;
  }

  return null;
}

function validateStripeWebhookSecret(name, value) {
  if (isPlaceholderValue(value)) {
    return `${name} is not configured.`;
  }

  if (!value.startsWith("whsec_") || value.length < 20 || value !== value.trim()) {
    return `${name} does not look like a Stripe webhook signing secret.`;
  }

  return null;
}

function validateRedisUrl(name, value) {
  if (isPlaceholderValue(value)) {
    return `${name} is not configured.`;
  }

  try {
    const url = new URL(value);

    if ((url.protocol !== "redis:" && url.protocol !== "rediss:") || !url.hostname) {
      return `${name} must be a valid Redis URL.`;
    }
  } catch {
    return `${name} must be a valid Redis URL.`;
  }

  return null;
}

function validatePostgresUrl(name, value, direct = false) {
  if (isPlaceholderValue(value)) {
    return `${name} is not configured.`;
  }

  try {
    const url = new URL(value);

    if ((url.protocol !== "postgres:" && url.protocol !== "postgresql:") || !url.hostname) {
      return `${name} must be a valid PostgreSQL URL.`;
    }

    if (direct && url.searchParams.get("pgbouncer")?.toLowerCase() === "true") {
      return `${name} must bypass PgBouncer for schema and administrative commands.`;
    }
  } catch {
    return `${name} must be a valid PostgreSQL URL.`;
  }

  return null;
}

function validatePositiveInteger(name, value) {
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    return `${name} must be a positive integer.`;
  }

  return null;
}

function validateBase64Key(name, value) {
  try {
    const decoded = Buffer.from(value, "base64");
    if (decoded.byteLength !== 32 || decoded.toString("base64") !== value) {
      return `${name} must be a base64-encoded 32-byte key.`;
    }
  } catch {
    return `${name} must be a base64-encoded 32-byte key.`;
  }

  return null;
}

function validateRequiredEnv({ name, type }) {
  const value = process.env[name] ?? "";

  if (type === "sentry-dsn") {
    return validateSentryDsn(name, value);
  }

  if (type === "stripe-secret-key") {
    return validateStripeSecretKey(name, value);
  }

  if (type === "stripe-webhook-secret") {
    return validateStripeWebhookSecret(name, value);
  }

  if (type === "redis-url") {
    return validateRedisUrl(name, value);
  }

  if (type === "postgres-url") {
    return validatePostgresUrl(name, value);
  }

  if (type === "direct-postgres-url") {
    return validatePostgresUrl(name, value, true);
  }

  if (type === "positive-integer") {
    return validatePositiveInteger(name, value);
  }

  if (type === "base64-32-byte-key") {
    return validateBase64Key(name, value);
  }

  return validateTextEnv(name, value);
}

function checkDatabaseConnectionBudget(failures) {
  const names = [
    "VFURST_DB_CONNECTION_LIMIT",
    "VFURST_DB_CONNECTION_BUDGET",
    "VFURST_WEB_REPLICAS",
    "VFURST_WORKER_REPLICAS"
  ];

  if (names.some((name) => validatePositiveInteger(name, process.env[name] ?? ""))) {
    return;
  }

  const connectionLimit = Number(process.env.VFURST_DB_CONNECTION_LIMIT);
  const budget = Number(process.env.VFURST_DB_CONNECTION_BUDGET);
  const webReplicas = Number(process.env.VFURST_WEB_REPLICAS);
  const workerReplicas = Number(process.env.VFURST_WORKER_REPLICAS);
  const maximumDemand = connectionLimit * (webReplicas + workerReplicas);

  if (maximumDemand <= budget) {
    ok(
      `Database pool demand is bounded at ${maximumDemand} connections (${webReplicas} web + ${workerReplicas} worker replicas) within the configured budget of ${budget}.`
    );
  } else {
    fail(
      failures,
      `Database pool demand is ${maximumDemand} connections but VFURST_DB_CONNECTION_BUDGET is only ${budget}.`
    );
  }
}

async function readText(path) {
  return readFile(path, "utf8");
}

function parseMarkdownTableRows(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|") && line.includes("|"))
    .map((line) =>
      line
        .trim()
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells.length > 0 && !cells.every((cell) => /^-+$/.test(cell)));
}

async function checkBetaEvidence(failures) {
  const content = await readText("docs/launch/beta-program.md");
  const rows = parseMarkdownTableRows(content);
  const requiredRows = rows.filter((cells) => cells[0] === "1" || cells[0] === "2");
  const verifiedRows = requiredRows.filter((cells) => cells[1] && cells[1] !== "TBD" && cells[2] === "Externally verified");

  if (verifiedRows.length >= 2) {
    ok("At least two beta conventions are externally verified.");
  } else {
    fail(failures, "Fewer than two beta conventions are externally verified in docs/launch/beta-program.md.");
  }
}

async function checkScreenReaderEvidence(failures) {
  const content = await readText("docs/launch/accessibility-audit.md");
  const passIsComplete = /^- Screen-reader pass:\s*Complete\s*$/im.test(content);
  const hasPlaceholderEvidence = /^- (Tester|Assistive technology|Verified flows):\s*TBD\s*$/im.test(content);
  const stillNeedsPass = content.includes("physical screen-reader pass should be performed");

  if (passIsComplete && !hasPlaceholderEvidence && !stillNeedsPass) {
    ok("Physical screen-reader pass is documented as complete.");
  } else {
    fail(failures, "Physical screen-reader pass is still not documented as complete.");
  }
}

async function checkLiveMarketing(failures) {
  const launchUrl = process.env.VFURST_LAUNCH_URL;

  if (!launchUrl) {
    fail(failures, "VFURST_LAUNCH_URL is not set, so the public marketing site cannot be verified live.");
    return;
  }

  for (const route of marketingPaths) {
    const url = new URL(route.path, launchUrl);

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });

      if (!response.ok) {
        fail(failures, `Live marketing route ${url.href} returned ${response.status}.`);
        continue;
      }

      const body = await response.text();
      const missingText = route.expectedText.filter((text) => !body.includes(text));

      if (missingText.length === 0) {
        ok(`Live marketing route ${url.href} returned ${response.status} with expected launch content.`);
      } else {
        fail(failures, `Live marketing route ${url.href} is missing expected content: ${missingText.join(", ")}.`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      fail(failures, `Live marketing route ${url.href} could not be verified: ${message}.`);
    }
  }
}

async function main() {
  await loadDotEnv(".env");
  await loadDotEnv(".env.local");

  const failures = [];

  for (const file of requiredFiles) {
    try {
      await readFile(file, "utf8");
      ok(`${file} exists.`);
    } catch {
      fail(failures, `${file} is missing.`);
    }
  }

  for (const envConfig of requiredEnv) {
    const error = validateRequiredEnv(envConfig);

    if (error) {
      fail(failures, error);
    } else {
      ok(`${envConfig.name} is configured.`);
    }
  }

  checkDatabaseConnectionBudget(failures);

  await checkBetaEvidence(failures);

  if (await fileIncludes("docs/launch/security-audit.md", "Blocking finding")) {
    fail(failures, "Security audit still records a blocking finding.");
  } else {
    ok("Security audit has no recorded blocking finding.");
  }

  if (
    !(await fileIncludes("docs/launch/performance-load-test.md", "The launch 500-registration/50-check-in performance gate is passed"))
  ) {
    fail(failures, "Full launch k6 target run is not documented as passed.");
  } else {
    ok("Full launch k6 target run is documented as passed.");
  }

  await checkScreenReaderEvidence(failures);

  await checkLiveMarketing(failures);

  if (failures.length > 0) {
    console.log("");
    console.log(`${failures.length} launch readiness check(s) failed.`);
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log("Launch readiness checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
