import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CONTRACT_ADDITIONS = ["S3_PUBLIC_URL"];
export const CONTRACT_EXCLUSIONS = ["SENTRY_AUTH_TOKEN", "SENTRY_ORG", "SENTRY_PROJECT", "VFURST_LAUNCH_URL"];
export const MIGRATE_ENVIRONMENT = ["NODE_ENV", "DATABASE_URL", "DIRECT_DATABASE_URL"];

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

export function projectForDocker(source) {
  const markers = [...source.matchAll(/^[ \t]*exclude_from_hc: true\r?(?:\n|$)/gm)];
  if (markers.length !== 1) {
    throw new Error("Compose must contain exactly one exclude_from_hc marker");
  }

  const marker = markers[0];
  const services = [...source.slice(0, marker.index).matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)];
  if (services.at(-1)?.[1] !== "migrate") {
    throw new Error("exclude_from_hc marker must belong to migrate");
  }

  return source.slice(0, marker.index) + source.slice(marker.index + marker[0].length);
}

export function placeholderEnvironment(source) {
  const environment = {};
  for (const match of source.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*):\?[^}]*\}/g)) {
    environment[match[1]] = "compose-validate-placeholder";
  }
  return environment;
}

export function parseEnvExampleKeys(source) {
  const keys = new Set();
  for (const match of source.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)) {
    keys.add(match[1]);
  }
  return [...keys];
}

export function checkEnvironmentContract(config, contracts) {
  const errors = [];
  for (const service of ["web", "worker"]) {
    const environment = config.services[service]?.environment ?? {};
    const required = new Set([...contracts[service], ...CONTRACT_ADDITIONS]);
    for (const excluded of CONTRACT_EXCLUSIONS) required.delete(excluded);
    for (const key of required) {
      if (!Object.hasOwn(environment, key)) errors.push(`${service} is missing ${key}`);
    }
    for (const key of CONTRACT_EXCLUSIONS) {
      if (Object.hasOwn(environment, key)) errors.push(`${service} must not set ${key}`);
    }
  }

  const migrateEnvironment = config.services.migrate?.environment ?? {};
  for (const key of MIGRATE_ENVIRONMENT) {
    if (!Object.hasOwn(migrateEnvironment, key)) errors.push(`migrate is missing ${key}`);
  }
  for (const key of Object.keys(migrateEnvironment)) {
    if (!MIGRATE_ENVIRONMENT.includes(key)) errors.push(`migrate must not set ${key}`);
  }
  return errors;
}

export function main(argv) {
  try {
    const source = readFileSync(join(repositoryRoot, "compose.prod.yaml"), "utf8");
    const projected = projectForDocker(source);
    if (argv.includes("--print")) {
      process.stdout.write(projected);
      return 0;
    }

    const result = spawnSync("docker", ["compose", "-p", "vfurst-compose-validate", "-f", "-", "config", "--format", "json"], {
      input: projected,
      cwd: repositoryRoot,
      env: { ...process.env, ...placeholderEnvironment(source) },
      encoding: "utf8",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.stderr.write(result.stderr);
      return 1;
    }

    const config = JSON.parse(result.stdout);
    const contracts = {
      web: parseEnvExampleKeys(readFileSync(join(repositoryRoot, "apps", "web", ".env.example"), "utf8")),
      worker: parseEnvExampleKeys(readFileSync(join(repositoryRoot, "apps", "worker", ".env.example"), "utf8")),
    };
    const errors = checkEnvironmentContract(config, contracts);
    for (const error of errors) process.stderr.write(`${error}\n`);
    if (errors.length > 0) return 1;

    process.stdout.write(`compose.prod.yaml is valid: web ${Object.keys(config.services.web.environment ?? {}).length} keys, worker ${Object.keys(config.services.worker.environment ?? {}).length} keys.\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
