import { describe, expect, it } from "vitest";
import { isVfurstInternalHeader, scrubVfurstInternalHeaders } from "./request-headers";

describe("scrubVfurstInternalHeaders", () => {
  it("removes every caller-controlled internal tenant header case-insensitively", () => {
    const source = new Headers({
      host: "console.vfurst.example.com",
      authorization: "Bearer public-api-token",
      "X-VFURST-ORG-HOST": "forged.customer.example",
      "x-vfurst-org-id": "forged-id",
      "x-vfurst-domain-mode": "custom-domain",
      "x-unrelated": "preserved"
    });
    const scrubbed = scrubVfurstInternalHeaders(source);

    expect([...scrubbed.keys()].filter(isVfurstInternalHeader)).toEqual([]);
    expect(scrubbed.get("host")).toBe("console.vfurst.example.com");
    expect(scrubbed.get("authorization")).toBe("Bearer public-api-token");
    expect(scrubbed.get("x-unrelated")).toBe("preserved");
  });

  it("returns a copy and leaves the original request headers untouched", () => {
    const source = new Headers({ "x-vfurst-org-host": "forged.example", accept: "application/json" });
    const scrubbed = scrubVfurstInternalHeaders(source);

    expect(scrubbed).not.toBe(source);
    expect(scrubbed.has("x-vfurst-org-host")).toBe(false);
    expect(source.get("x-vfurst-org-host")).toBe("forged.example");
  });

  it.each(["x-vfurst-org-host", "X-VFURST-CONTEXT", " x-vfurst-test "])("recognizes internal header %s", (name) => {
    expect(isVfurstInternalHeader(name)).toBe(true);
  });
});
