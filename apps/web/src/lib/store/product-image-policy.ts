const PRODUCT_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
} as const;

export const PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_MAX_COUNT = 8;

export type ProductImageType = keyof typeof PRODUCT_IMAGE_TYPES;

export function validateProductImageMetadata(file: { size: number; type: string }) {
  if (!(file.type in PRODUCT_IMAGE_TYPES)) {
    throw new Error("Product images must be PNG, JPEG, or WebP files.");
  }

  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    throw new Error("Product images must be 5 MB or smaller.");
  }

  return {
    contentType: file.type as ProductImageType,
    extension: PRODUCT_IMAGE_TYPES[file.type as ProductImageType]
  };
}

export function validateProductImageContents(bytes: Uint8Array, contentType: ProductImageType) {
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
    (contentType === "image/png" && isPng) ||
    (contentType === "image/jpeg" && isJpeg) ||
    (contentType === "image/webp" && isWebp);

  if (!matches) {
    throw new Error("Product image contents do not match the declared file type.");
  }
}

export function validateProductImageUrl(value: string) {
  let url: URL;

  if (value.length > 2_048) {
    throw new Error("Product image URLs must be valid HTTP or HTTPS URLs.");
  }

  try {
    url = new URL(value);
  } catch {
    throw new Error("Product image URLs must be valid HTTP or HTTPS URLs.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Product image URLs must be valid HTTP or HTTPS URLs.");
  }

  return url.toString();
}
