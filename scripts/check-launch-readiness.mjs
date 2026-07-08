import { readFile } from "node:fs/promises";
import process from "node:process";

const explicitEnv = new Set(Object.keys(process.env));
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
  "scripts/run-launch-load-proof.mjs",
  "tests/load/registration-checkin.k6.js",
  "tests/e2e/launch-critical-paths.spec.ts",
  "tests/e2e/launch-accessibility-smoke.spec.ts"
];

const requiredEnv = [
  "NEXT_PUBLIC_SENTRY_DSN",
  "SENTRY_DSN",
  "SENTRY_ORG",
  "SENTRY_PROJECT",
  "SENTRY_AUTH_TOKEN"
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

  for (const name of requiredEnv) {
    if (process.env[name]) {
      ok(`${name} is configured.`);
    } else {
      fail(failures, `${name} is not configured.`);
    }
  }

  await checkBetaEvidence(failures);

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
