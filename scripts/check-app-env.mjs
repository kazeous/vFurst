#!/usr/bin/env node
/**
 * Fail loudly when an application is started without the configuration it needs.
 *
 * Several helpers in this repository fall back to a hardcoded default when a
 * variable is absent — `NEXT_PUBLIC_ROOT_DOMAIN` falls back to the production
 * domain, and the absolute-URL helpers fall back to http://localhost:3000. Those
 * fallbacks turn a missing file into subtly wrong routing rather than an error,
 * which is how the 2026-07-26 runtime audit found every tenant subdomain
 * returning 404 in local development. This check makes that state visible at
 * startup instead.
 *
 * Runs from `predev` and `prestart`, never during `next build`, so a build in CI
 * (which sets only DATABASE_URL) is unaffected.
 *
 * Usage: node scripts/check-app-env.mjs <web|worker>
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isPlaceholder, resolveAppEnv } from "./lib/env-file.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const APPS = {
  web: {
    label: "@vfurst/web",
    envFiles: ["apps/web/.env.local", "apps/web/.env"],
    required: [
      ["DATABASE_URL", "Prisma cannot connect; every page that reads data fails."],
      ["REDIS_URL", "Shared rate limiting fails closed, so every paid flow returns a server error."],
      ["NEXT_PUBLIC_ROOT_DOMAIN", "Host classification falls back to the production domain and every tenant subdomain returns 404."],
      ["NEXT_PUBLIC_APP_URL", "Absolute redirects fall back to a hardcoded http://localhost:3000."],
      ["AUTH_SECRET", "Sessions cannot be signed consistently across restarts or replicas."],
      ["AUTH_AUTHENTIK_ISSUER", "Staff cannot sign in through the studio identity provider."],
      ["AUTH_AUTHENTIK_ID", "Staff cannot sign in through the studio identity provider."],
      ["AUTH_AUTHENTIK_SECRET", "Staff cannot sign in through the studio identity provider."],
      ["VFURST_DB_CONNECTION_LIMIT", "The documented Prisma connection budget is not applied."],
      ["VFURST_DB_POOL_TIMEOUT_SECONDS", "The documented Prisma pool timeout is not applied."],
      ["EMAIL_DELIVERY_ENCRYPTION_KEY", "The encrypted email outbox cannot be written."],
      ["S3_BUCKET_NAME", "Uploads and badge assets have no destination."],
      ["AWS_REGION", "The S3 client cannot be constructed."],
      ["AWS_ACCESS_KEY_ID", "The S3 client cannot authenticate."],
      ["AWS_SECRET_ACCESS_KEY", "The S3 client cannot authenticate."]
    ],
    optional: [
      ["CHECKOUT_TOKEN_SECRET", "Checkout tokens fall back to AUTH_SECRET."],
      ["STRIPE_SECRET_KEY", "Stripe checkout is unavailable."],
      ["STRIPE_WEBHOOK_SECRET", "Stripe webhooks cannot be verified."],
      ["SEPAY_WEBHOOK_SECRET", "SePay webhooks cannot be verified."],
      ["SMTP_HOST", "Outbound email has no transport."]
    ]
  },
  worker: {
    label: "@vfurst/worker",
    envFiles: ["apps/worker/.env"],
    required: [
      ["DATABASE_URL", "The worker cannot start."],
      ["REDIS_URL", "No queue connection; no job is ever processed."],
      ["VFURST_DB_CONNECTION_LIMIT", "The documented Prisma connection budget is not applied."],
      ["VFURST_DB_POOL_TIMEOUT_SECONDS", "The documented Prisma pool timeout is not applied."],
      ["EMAIL_DELIVERY_ENCRYPTION_KEY", "Queued email payloads cannot be decrypted."],
      ["S3_BUCKET_NAME", "Badge rendering cannot read tenant assets."],
      ["AWS_REGION", "The S3 client cannot be constructed."],
      ["AWS_ACCESS_KEY_ID", "The S3 client cannot authenticate."],
      ["AWS_SECRET_ACCESS_KEY", "The S3 client cannot authenticate."]
    ],
    optional: [
      ["SMTP_HOST", "Outbound email has no transport."],
      ["SEPAY_API_TOKEN", "SePay reconciliation is unavailable."]
    ]
  }
};

function main() {
  const appName = process.argv[2];
  const app = APPS[appName];

  if (!app) {
    console.error(`Usage: node scripts/check-app-env.mjs <${Object.keys(APPS).join("|")}>`);
    process.exit(2);
  }

  const env = resolveAppEnv(
    app.envFiles.map((file) => join(repoRoot, file)),
    process.env
  );

  const missing = [];
  const placeholders = [];

  for (const [key, consequence] of app.required) {
    const value = env[key];

    if (value === undefined || value === "") {
      missing.push([key, consequence]);
    } else if (isPlaceholder(value)) {
      placeholders.push([key, consequence]);
    }
  }

  const warnings = app.optional.filter(([key]) => {
    const value = env[key];
    return value === undefined || value === "" || isPlaceholder(value);
  });

  if (warnings.length > 0) {
    console.warn(`\n[check-app-env] ${app.label} is starting without optional configuration:`);
    for (const [key, consequence] of warnings) {
      console.warn(`  - ${key}: ${consequence}`);
    }
    console.warn("");
  }

  if (missing.length === 0 && placeholders.length === 0) {
    console.log(`[check-app-env] ${app.label} configuration is complete.`);
    return;
  }

  const lines = [
    "",
    `${app.label} cannot start: required configuration is missing or unset.`,
    ""
  ];

  if (missing.length > 0) {
    lines.push("Missing:");
    for (const [key, consequence] of missing) {
      lines.push(`  - ${key} — ${consequence}`);
    }
    lines.push("");
  }

  if (placeholders.length > 0) {
    lines.push("Still set to a template placeholder:");
    for (const [key, consequence] of placeholders) {
      lines.push(`  - ${key} — ${consequence}`);
    }
    lines.push("");
  }

  lines.push(
    "To fix locally:",
    "  1. Set the values in the repository-root .env.local",
    "  2. Run: node scripts/sync-app-env.mjs",
    "",
    `This app reads ${app.envFiles.join(" then ")}, not the repository-root file.`,
    `See apps/${appName}/.env.example for the full contract.`,
    ""
  );

  console.error(lines.join("\n"));
  process.exit(1);
}

main();
