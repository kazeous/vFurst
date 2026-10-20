import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ensureNextManifests } from "./ensure-next-manifests.mjs";

function fixture(t, standalone = true) {
  const root = mkdtempSync(join(tmpdir(), "vfurst-next-manifests-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const distDirs = [join(root, ".next")];
  if (standalone) distDirs.push(join(root, ".next/standalone/apps/web/.next"));
  for (const dist of distDirs) mkdirSync(join(dist, "server"), { recursive: true });
  return { root, distDirs };
}

test("creates both stubs in .next and the standalone .next", (t) => {
  const { root, distDirs } = fixture(t);
  const expected = distDirs.flatMap((dist) => [join(dist, "server/subresource-integrity-manifest.json"), join(dist, "dynamic-css-manifest")]);
  const created = ensureNextManifests(root);
  assert.deepEqual(created.sort(), expected.sort());
  for (const path of created) assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), {});
});

test("leaves an existing manifest untouched", (t) => {
  const { root, distDirs } = fixture(t);
  const existing = join(distDirs[0], "server/subresource-integrity-manifest.json");
  writeFileSync(existing, '{"a":1}', "utf8");
  const created = ensureNextManifests(root);
  assert.equal(readFileSync(existing, "utf8"), '{"a":1}');
  assert.ok(!created.includes(existing));
  assert.equal(created.length, 3);
});

test("skips a missing standalone directory", (t) => {
  const { root, distDirs } = fixture(t, false);
  const created = ensureNextManifests(root);
  assert.deepEqual(created.sort(), [join(distDirs[0], "server/subresource-integrity-manifest.json"), join(distDirs[0], "dynamic-css-manifest")].sort());
  assert.equal(existsSync(join(root, ".next/standalone")), false);
});
