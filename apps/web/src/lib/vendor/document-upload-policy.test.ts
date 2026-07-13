import { describe, expect, it } from "vitest";
import {
  VENDOR_DOCUMENT_MAX_BYTES,
  validateVendorDocumentContents,
  validateVendorDocumentMetadata,
  validateVendorDocumentUrl
} from "./document-upload-policy";

describe("vendor document upload policy", () => {
  it.each([
    ["application/pdf", "pdf"],
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"]
  ] as const)("accepts supported %s metadata", (contentType, extension) => {
    expect(validateVendorDocumentMetadata({ size: VENDOR_DOCUMENT_MAX_BYTES, type: contentType })).toEqual({
      contentType,
      extension
    });
  });

  it("rejects unsupported types before reading the file", () => {
    expect(() => validateVendorDocumentMetadata({ size: 128, type: "image/svg+xml" })).toThrow(
      "Vendor files must be PDF, PNG, JPEG, or WebP files."
    );
  });

  it("rejects oversized files before reading the file", () => {
    expect(() => validateVendorDocumentMetadata({ size: VENDOR_DOCUMENT_MAX_BYTES + 1, type: "application/pdf" })).toThrow(
      "Vendor files must be 10 MB or smaller."
    );
  });

  it("accepts matching PDF and image signatures", () => {
    expect(() => validateVendorDocumentContents(new TextEncoder().encode("%PDF-1.7"), "application/pdf")).not.toThrow();
    expect(() =>
      validateVendorDocumentContents(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")
    ).not.toThrow();
    expect(() => validateVendorDocumentContents(new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg")).not.toThrow();
    expect(() =>
      validateVendorDocumentContents(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
        "image/webp"
      )
    ).not.toThrow();
  });

  it("rejects contents that do not match the declared type", () => {
    expect(() => validateVendorDocumentContents(new TextEncoder().encode("not a pdf"), "application/pdf")).toThrow(
      "Vendor file contents do not match the declared file type."
    );
  });

  it("allows only HTTP and HTTPS file URLs", () => {
    expect(validateVendorDocumentUrl("https://cdn.example.com/portfolio.pdf")).toBe(
      "https://cdn.example.com/portfolio.pdf"
    );
    expect(() => validateVendorDocumentUrl("data:application/pdf;base64,AAAA")).toThrow(
      "Vendor file URLs must be valid HTTP or HTTPS URLs."
    );
  });
});
