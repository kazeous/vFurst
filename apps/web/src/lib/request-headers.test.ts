import { describe, expect, it } from "vitest";
import { isVfurstInternalHeader, scrubVfurstInternalHeaders } from "./request-headers";

describe("scrubVfurstInternalHeaders", () => {
  it("removes every caller-controlled internal tenant header case-insensitively", () => {
    const source = new Headers({
      host: "localhost:3000",
      authorization: "Bearer public-api-token",
      "X-VFURST-ORG-HOST": "forged.customer.example",
      "x-vfurst-org-slug": "forged-slug",
      "x-vfurst-domain-mode": "custom-domain",
      "x-unrelated": "preserved"
    });
    const scrubbed = scrubVfurstInternalHeaders(source);

    expect([...scrubbed.keys()].filter(isVfurstInternalHeader)).toEqual([]);
    expect(scrubbed.get("host")).toBe("localhost:3000");
    expect(scrubbed.get("authorization")).toBe("Bearer public-api-token");
    expect(scrubbed.get("x-unrelated")).toBe("preserved");
    expect(source.get("x-vfurst-org-host")).toBe("forged.customer.example");
  });
});
