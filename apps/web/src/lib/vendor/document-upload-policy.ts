import { PublicActionError } from "@/lib/public-action-error";

const VENDOR_DOCUMENT_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
} as const;

export const VENDOR_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const VENDOR_DOCUMENT_MAX_COUNT = 5;

export type VendorDocumentType = keyof typeof VENDOR_DOCUMENT_TYPES;

export function validateVendorDocumentMetadata(file: { size: number; type: string }) {
  if (!(file.type in VENDOR_DOCUMENT_TYPES)) {
    throw new PublicActionError("Vendor files must be PDF, PNG, JPEG, or WebP files.");
  }

  if (file.size > VENDOR_DOCUMENT_MAX_BYTES) {
    throw new PublicActionError("Vendor files must be 10 MB or smaller.");
  }

  return {
    contentType: file.type as VendorDocumentType,
    extension: VENDOR_DOCUMENT_TYPES[file.type as VendorDocumentType]
  };
}

export function validateVendorDocumentContents(bytes: Uint8Array, contentType: VendorDocumentType) {
  const isPdf =
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d;
  const isPng =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a;
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp =
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  const matches =
    (contentType === "application/pdf" && isPdf) ||
    (contentType === "image/png" && isPng) ||
    (contentType === "image/jpeg" && isJpeg) ||
    (contentType === "image/webp" && isWebp);

  if (!matches) {
    throw new PublicActionError("Vendor file contents do not match the declared file type.");
  }
}

export function validateVendorDocumentUrl(value: string) {
  let url: URL;

  if (value.length > 2_048) {
    throw new PublicActionError("Vendor file URLs must be valid HTTP or HTTPS URLs.");
  }

  try {
    url = new URL(value);
  } catch {
    throw new PublicActionError("Vendor file URLs must be valid HTTP or HTTPS URLs.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new PublicActionError("Vendor file URLs must be valid HTTP or HTTPS URLs.");
  }

  return url.toString();
}
