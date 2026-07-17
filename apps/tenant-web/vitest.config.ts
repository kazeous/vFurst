import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@vfurst/auth": fileURLToPath(new URL("../../packages/auth/src/index.ts", import.meta.url)),
      "@vfurst/contracts": fileURLToPath(new URL("../../packages/contracts/src/index.ts", import.meta.url)),
      "@vfurst/db": fileURLToPath(new URL("../../packages/db/src/index.ts", import.meta.url)),
      "@vfurst/tenant-context/prisma": fileURLToPath(new URL("../../packages/tenant-context/src/prisma.ts", import.meta.url)),
      "@vfurst/tenant-context": fileURLToPath(new URL("../../packages/tenant-context/src/index.ts", import.meta.url))
    }
  }
});
