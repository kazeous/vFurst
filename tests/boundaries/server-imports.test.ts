import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const repoRoot = process.cwd();
const sourceRoot = join(repoRoot, "src");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      return listSourceFiles(fullPath);
    }

    if (/\.(ts|tsx)$/.test(entry)) {
      return [fullPath];
    }

    return [];
  });
}

describe("frontend/server import boundary", () => {
  it("prevents client components from importing server modules", () => {
    const offenders = listSourceFiles(sourceRoot)
      .filter((file) => readFileSync(file, "utf8").startsWith('"use client"'))
      .filter((file) => {
        const contents = readFileSync(file, "utf8");
        return /from\s+["']@\/server\//.test(contents) || /from\s+["']\.\.?\/.*server\//.test(contents);
      })
      .map((file) => relative(repoRoot, file));

    expect(offenders).toEqual([]);
  });
});
