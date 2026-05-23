import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns a safe health payload", async () => {
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "ok",
      service: "vfurst",
      phase: "foundation"
    });
    expect(JSON.stringify(body)).not.toContain("DATABASE_URL");
  });
});
