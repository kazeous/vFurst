import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** @param {string} webRoot @returns {string[]} */
export function ensureNextManifests(webRoot) {
  const root = resolve(webRoot);
  const created = [];
  for (const dist of [join(root, ".next"), join(root, ".next/standalone/apps/web/.next")]) {
    if (!existsSync(dist)) continue;
    mkdirSync(join(dist, "server"), { recursive: true });
    for (const path of [join(dist, "server/subresource-integrity-manifest.json"), join(dist, "dynamic-css-manifest")]) {
      try {
        writeFileSync(path, "{}", { encoding: "utf8", flag: "wx" });
        created.push(path);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
  }
  return created;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  for (const path of ensureNextManifests(process.argv[2] ?? "apps/web")) console.log(path);
}
