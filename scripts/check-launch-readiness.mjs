import { readFile } from "node:fs/promises";
import process from "node:process";

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
  "scripts/run-launch-load-proof.mjs",
  "tests/load/registration-checkin.k6.js",
  "tests/e2e/launch-critical-paths.spec.ts"
];

const requiredEnv = [
  "NEXT_PUBLIC_SENTRY_DSN",
  "SENTRY_DSN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_AUTH_TOKEN"
];

const marketingPaths = ["/", "/features", "/pricing", "/privacy", "/terms", "/dmca"];

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

async function checkLiveMarketing(failures) {
  const launchUrl = process.env.VFURST_LAUNCH_URL;

  if (!launchUrl) {
    fail(failures, "VFURST_LAUNCH_URL is not set, so the public marketing site cannot be verified live.");
    return;
  }

  for (const path of marketingPaths) {
    const url = new URL(path, launchUrl);
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (response.ok) {
      ok(`Live marketing route ${url.href} returned ${response.status}.`);
    } else {
      fail(failures, `Live marketing route ${url.href} returned ${response.status}.`);
    }
  }
}

async function main() {
  const failures = [];

  for (const file of requiredFiles) {
    try {
      await readFile(file, "utf8");
      ok(`${file} exists.`);
    } catch {
      fail(failures, `${file} is missing.`);
    }
  }

  for (const name of requiredEnv) {
    if (process.env[name]) {
      ok(`${name} is configured.`);
    } else {
      fail(failures, `${name} is not configured.`);
    }
  }

  if (await fileIncludes("docs/launch/beta-program.md", "TBD | Not externally verified")) {
    fail(failures, "Beta-program evidence still contains TBD / not externally verified slots.");
  } else {
    ok("Beta-program evidence no longer contains TBD slots.");
  }

  if (await fileIncludes("docs/launch/security-audit.md", "Blocking finding")) {
    fail(failures, "Security audit still records a blocking finding.");
  } else {
    ok("Security audit has no recorded blocking finding.");
  }

  if (await fileIncludes("docs/launch/performance-load-test.md", "The Phase 7 target run has not passed yet")) {
    fail(failures, "Full Phase 7 k6 target run is not documented as passed.");
  } else {
    ok("Full Phase 7 k6 target run is documented as passed.");
  }

  if (await fileIncludes("docs/launch/accessibility-audit.md", "physical screen-reader pass should be performed")) {
    fail(failures, "Physical screen-reader pass is still not documented as complete.");
  } else {
    ok("Physical screen-reader pass is documented as complete.");
  }

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
