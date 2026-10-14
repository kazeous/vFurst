import test from "node:test";
import assert from "node:assert/strict";

import {
  checkBuildTimeRequirements,
  checkEnvironmentContract,
  parseEnvExampleKeys,
  placeholderEnvironment,
  projectForDocker,
} from "./validate-compose.mjs";

const composeLines = [
  "services:",
  "  migrate:",
  "    exclude_from_hc: true",
  '    restart: "no"',
  "  web:",
  "    image: web",
];

test("projectForDocker removes the migrate marker", () => {
  const result = projectForDocker(composeLines.join("\n"));
  assert.doesNotMatch(result, /exclude_from_hc/);
  assert.match(result, /    restart: "no"/);
});

test("projectForDocker keeps CRLF line endings", () => {
  const source = `${composeLines.join("\r\n")}\r\n`;
  const expected = `${composeLines.filter((line) => !line.includes("exclude_from_hc")).join("\r\n")}\r\n`;
  assert.equal(projectForDocker(source), expected);
});

test("projectForDocker rejects a file without a marker", () => {
  assert.throws(() => projectForDocker("services:\n  migrate:\n"), /exactly one exclude_from_hc marker/);
});

test("projectForDocker rejects two markers", () => {
  const source = [...composeLines, "    exclude_from_hc: true"].join("\n");
  assert.throws(() => projectForDocker(source), /exactly one exclude_from_hc marker/);
});

test("projectForDocker rejects a marker on another service", () => {
  const source = "services:\n  web:\n    exclude_from_hc: true\n";
  assert.throws(() => projectForDocker(source), /must belong to migrate/);
});

test("placeholderEnvironment lists each required variable once", () => {
  const source = "a: ${A:?x}\nb: ${B:?y}\nc: ${A:?z}\nd: ${C:-d}\ne: ${D}";
  assert.deepEqual(placeholderEnvironment(source), {
    A: "compose-validate-placeholder",
    B: "compose-validate-placeholder",
  });
});

test("checkBuildTimeRequirements accepts build-time required variables", () => {
  const source = "a: ${SOURCE_COMMIT:?x}\nb: ${NEXT_PUBLIC_APP_URL:?y}\nc: ${AUTH_SECRET:-}";
  assert.deepEqual(checkBuildTimeRequirements(source), []);
});

test("checkBuildTimeRequirements rejects runtime variables marked required", () => {
  const source = "a: ${POSTGRES_USER:?x}\nb: ${AUTH_SECRET:?y}\nc: ${POSTGRES_USER:?z}";
  assert.deepEqual(checkBuildTimeRequirements(source), [
    "POSTGRES_USER must not use :? because Coolify interpolates the Compose file with build-time variables only",
    "AUTH_SECRET must not use :? because Coolify interpolates the Compose file with build-time variables only",
  ]);
});

test("parseEnvExampleKeys ignores comments and blank lines", () => {
  const source = "# c\r\n\r\nNODE_ENV=x\r\nREDIS_URL=redis://y\r\nNODE_ENV=z\r\n";
  assert.deepEqual(parseEnvExampleKeys(source), ["NODE_ENV", "REDIS_URL"]);
});

const contracts = { web: ["AUTH_URL", "SENTRY_ORG"], worker: ["REDIS_URL"] };
const completeConfig = {
  services: {
    web: { environment: { AUTH_URL: "x", S3_PUBLIC_URL: "" } },
    worker: { environment: { REDIS_URL: "x", S3_PUBLIC_URL: "" } },
    migrate: { environment: { NODE_ENV: "production", DATABASE_URL: "x", DIRECT_DATABASE_URL: "x" } },
  },
};

test("checkEnvironmentContract accepts a complete config", () => {
  assert.deepEqual(checkEnvironmentContract(completeConfig, contracts), []);
});

test("checkEnvironmentContract reports missing and forbidden keys", () => {
  const config = structuredClone(completeConfig);
  delete config.services.web.environment.AUTH_URL;
  config.services.web.environment.SENTRY_ORG = "x";
  delete config.services.worker.environment.S3_PUBLIC_URL;
  config.services.migrate.environment.REDIS_URL = "x";
  assert.deepEqual(checkEnvironmentContract(config, contracts), [
    "web is missing AUTH_URL",
    "web must not set SENTRY_ORG",
    "worker is missing S3_PUBLIC_URL",
    "migrate must not set REDIS_URL",
  ]);
});
