import { spawn, spawnSync } from "node:child_process";
import process from "node:process";

const defaultScript = "tests/load/registration-checkin.k6.js";
const passthroughArgs = process.argv.slice(2);
const runArgs = ["run", ...passthroughArgs];

if (!passthroughArgs.some((arg) => arg.endsWith(".js"))) {
  runArgs.push(defaultScript);
}

function canRun(command, args) {
  const result = spawnSync(command, args, {
    shell: process.platform === "win32",
    stdio: "ignore"
  });

  return result.status === 0;
}

function run(command, args) {
  const child = spawn(command, args, {
    shell: process.platform === "win32",
    stdio: "inherit"
  });

  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

function dockerEnvValue(name) {
  const value = process.env[name];

  if (!value || name !== "VFURST_BASE_URL") {
    return value;
  }

  return value.replace(/^(https?:\/\/)(localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/i, "$1host.docker.internal");
}

if (canRun("k6", ["version"])) {
  run("k6", runArgs);
} else if (canRun("docker", ["version"])) {
  const envNames = [
    "VFURST_BASE_URL",
    "VFURST_LOAD_ORG_SLUG",
    "VFURST_LOAD_EVENT_ID",
    "VFURST_STAFF_COOKIE",
    "VFURST_PORTAL_HOST",
    "VFURST_PORTAL_SESSION_COOKIE",
    "VFURST_HOST_HEADER",
    "VFURST_REGISTRATION_VUS",
    "VFURST_CHECKIN_VUS",
    "VFURST_LOAD_PROFILE"
  ];
  const dockerArgs = [
    "run",
    "--rm",
    "-v",
    `${process.cwd()}:/work`,
    "-w",
    "/work",
    "-e",
    "VFURST_K6_RUNTIME=docker"
  ];

  for (const name of envNames) {
    const value = dockerEnvValue(name);

    if (value) {
      dockerArgs.push("-e", `${name}=${value}`);
    }
  }

  dockerArgs.push("grafana/k6", ...runArgs);
  run("docker", dockerArgs);
} else {
  console.error("Unable to find k6 or Docker. Install k6, or start Docker and rerun npm run test:load.");
  process.exitCode = 1;
}
