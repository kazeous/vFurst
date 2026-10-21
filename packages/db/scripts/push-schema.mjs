import { spawnSync } from "node:child_process";
import { log as consoleLog, error as consoleError } from "node:console";
import { createRequire } from "node:module";
import process from "node:process";
import { fileURLToPath, pathToFileURL, URL } from "node:url";
import { formatPreparationResult, prepareAttendeeProfiles } from "./prepare-attendee-profiles.mjs";
import { createAdminPrismaClient } from "./prisma-admin-client.mjs";

export const ATTENDEE_PROFILE_NULL_MARKER = "Made the column `attendeeProfileId` on table `registrations` required, but there are";

const prismaCli = createRequire(import.meta.url).resolve("prisma/build/index.js");

export function runPrismaDbPush() {
  const pushed = spawnSync(process.execPath, [prismaCli, "db", "push", "--skip-generate"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: process.env,
    encoding: "utf8"
  });
  process.stdout.write(pushed.stdout ?? "");
  process.stderr.write(pushed.stderr ?? "");
  return { status: pushed.status, output: `${pushed.stdout ?? ""}${pushed.stderr ?? ""}` };
}

export async function pushSchemaWithAttendeeProfiles({ prepare, push, log = consoleLog, maxAttempts = 3 }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    log(formatPreparationResult(await prepare()));
    const pushed = push();
    if (pushed.status === 0) return { attempts: attempt };
    if (!pushed.output.includes(ATTENDEE_PROFILE_NULL_MARKER)) {
      throw Object.assign(new Error("prisma db push failed."), { exitCode: pushed.status ?? 1 });
    }
    if (attempt === maxAttempts) {
      throw Object.assign(new Error("Registrations without an attendee profile kept appearing; prisma db push failed after 3 attempts."), {
        exitCode: pushed.status ?? 1
      });
    }
    log(`Retrying attendee-profile preparation: registrations without a profile appeared before db push (attempt ${attempt + 1} of 3).`);
  }
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const client = createAdminPrismaClient();
  try {
    await pushSchemaWithAttendeeProfiles({ prepare: () => prepareAttendeeProfiles(client), push: runPrismaDbPush });
  } catch (error) {
    consoleError(error.message);
    process.exitCode = error.exitCode ?? 1;
  } finally {
    await client.$disconnect();
  }
}
