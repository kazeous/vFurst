import { describe, expect, it } from "vitest";
import {
  CHECKOUT_RETURN_PATH_FALLBACK,
  requireSafeCheckoutReturnPath,
  safeCheckoutReturnPath
} from "./checkout-return-path";

describe("checkout return path safety", () => {
  it("preserves a safe local confirmation path", () => {
    const path = "/sample-con/store?success=order-id";
    expect(requireSafeCheckoutReturnPath(path)).toBe(path);
    expect(safeCheckoutReturnPath(path)).toBe(path);
  });

  it.each([
    "/\\attacker.example",
    "/\\/attacker.example",
    "/%5cattacker.example",
    "/%2fattacker.example",
    "/path\r\nheader",
    "/path%0d%0aheader"
  ])("rejects unsafe path %j when writing and replaces it when reading", (path) => {
    expect(() => requireSafeCheckoutReturnPath(path)).toThrow(/safe local application paths/);
    expect(safeCheckoutReturnPath(path)).toBe(CHECKOUT_RETURN_PATH_FALLBACK);
  });
});
