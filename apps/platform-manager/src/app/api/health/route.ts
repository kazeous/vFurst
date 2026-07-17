import { createPlatformManagerHealth } from "@/lib/health";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(createPlatformManagerHealth(), {
    headers: {
      "cache-control": "no-store, max-age=0",
      "x-content-type-options": "nosniff",
      "x-vfurst-runtime": "platform-manager"
    }
  });
}
