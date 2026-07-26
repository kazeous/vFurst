#!/usr/bin/env node
/**
 * Derive per-application env files from the repository-root development file.
 *
 * Next.js only reads `.env*` from the application directory it is started in,
 * and nothing in this repository loads the root file into a process. Each app
 * therefore needs its own file. To keep one editable source of truth, this
 * script rewrites each app's file from the root `.env.local` (or `.env`) using
 * that app's `.env.example` as the key contract and as the layout template.
 *
 * It is a local development convenience only. When the root source file is
 * absent — every deployed environment — it exits quietly and changes nothing.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readEnvFile } from "./lib/env-file.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TARGETS = [
  { name: "web", exampleDir: "apps/web", outputFile: "apps/web/.env.local" },
  { name: "worker", exampleDir: "apps/worker", outputFile: "apps/worker/.env" }
];

const GENERATED_HEADER = [
  "# GENERATED FILE - do not edit.",
  "#",
  "# Written by `node scripts/sync-app-env.mjs` from the repository-root",
  "# .env.local using this app's .env.example as the key contract.",
  "# Edit the root file (or this app's .env.example to change which keys apply)",
  "# and re-run the script. It runs automatically on `npm run dev`.",
  ""
];

const ASSIGNMENT = /^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=)(.*)$/;

function resolveSourceFile() {
  for (const candidate of [".env.local", ".env"]) {
    const path = join(repoRoot, candidate);

    if (existsSync(path)) {
      return { path, values: readEnvFile(path) ?? {}, name: candidate };
    }
  }

  return null;
}

function renderFromTemplate(templateText, sourceValues) {
  const missing = [];

  const body = templateText
    .split(/\r?\n/)
    .map((line) => {
      const match = ASSIGNMENT.exec(line);

      if (!match) {
        return line;
      }

      const [, prefix, key, operator] = match;

      if (!(key in sourceValues)) {
        missing.push(key);
        return line;
      }

      return `${prefix}${key}${operator}${sourceValues[key]}`;
    })
    .join("\n");

  return { body, missing };
}

function stripLeadingComments(text) {
  const lines = text.split(/\r?\n/);
  let index = 0;

  while (index < lines.length && (lines[index].trim().startsWith("#") || lines[index].trim() === "")) {
    index += 1;
  }

  return lines.slice(index).join("\n");
}

function main() {
  const source = resolveSourceFile();

  if (!source) {
    // Deployed environments supply configuration directly; nothing to derive.
    return;
  }

  const summaries = [];

  for (const target of TARGETS) {
    const templatePath = join(repoRoot, target.exampleDir, ".env.example");

    if (!existsSync(templatePath)) {
      console.warn(`[sync-app-env] ${target.exampleDir}/.env.example is missing; skipped ${target.name}.`);
      continue;
    }

    const template = stripLeadingComments(readFileSync(templatePath, "utf8"));
    const { body, missing } = renderFromTemplate(template, source.values);
    const contents = `${GENERATED_HEADER.join("\n")}\n${body.replace(/^\n+/, "")}`;
    const outputPath = join(repoRoot, target.outputFile);
    const existing = existsSync(outputPath) ? readFileSync(outputPath, "utf8") : null;

    if (existing === contents) {
      summaries.push(`${target.outputFile} (unchanged)`);
    } else {
      writeFileSync(outputPath, contents, "utf8");
      summaries.push(`${target.outputFile} (written)`);
    }

    if (missing.length > 0) {
      console.warn(
        `[sync-app-env] ${target.outputFile}: ${missing.length} key(s) absent from ${source.name}, kept the example value: ${missing.join(", ")}`
      );
    }
  }

  console.log(`[sync-app-env] Derived from ${source.name}: ${summaries.join(", ")}`);
}

main();
