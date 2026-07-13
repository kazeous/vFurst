import { describe, expect, it } from "vitest";
import {
  PRODUCT_IMAGE_MAX_BYTES,
  validateProductImageContents,
  validateProductImageMetadata,
  validateProductImageUrl
} from "./product-image-policy";

describe("product image policy", () => {
  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"]
  ] as const)("accepts supported %s metadata", (contentType, extension) => {
    expect(validateProductImageMetadata({ size: PRODUCT_IMAGE_MAX_BYTES, type: contentType })).toEqual({
      contentType,
      extension
    });
  });

  it("rejects unsupported types before reading the file", () => {
    expect(() => validateProductImageMetadata({ size: 128, type: "image/svg+xml" })).toThrow(
      "Product images must be PNG, JPEG, or WebP files."
    );
  });

  it("rejects oversized files before reading the file", () => {
    expect(() => validateProductImageMetadata({ size: PRODUCT_IMAGE_MAX_BYTES + 1, type: "image/png" })).toThrow(
      "Product images must be 5 MB or smaller."
    );
  });

  it("accepts matching PNG, JPEG, and WebP signatures", () => {
    expect(() =>
      validateProductImageContents(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")
    ).not.toThrow();
    expect(() => validateProductImageContents(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg")).not.toThrow();
    expect(() =>
      validateProductImageContents(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
        "image/webp"
      )
    ).not.toThrow();
  });

  it("rejects a file whose contents do not match its declared type", () => {
    expect(() => validateProductImageContents(new TextEncoder().encode("not a png"), "image/png")).toThrow(
      "Product image contents do not match the declared file type."
    );
  });

  it("allows only HTTP and HTTPS image URLs", () => {
    expect(validateProductImageUrl("https://cdn.example.com/product.png")).toBe("https://cdn.example.com/product.png");
    expect(() => validateProductImageUrl("data:image/png;base64,AAAA")).toThrow(
      "Product image URLs must be valid HTTP or HTTPS URLs."
    );
  });
});
