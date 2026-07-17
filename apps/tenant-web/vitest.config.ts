import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@vfurst/tenant-context": fileURLToPath(new URL("../../packages/tenant-context/src/index.ts", import.meta.url))
    }
  }
});
