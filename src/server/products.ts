import "server-only";
import type { Product } from "@prisma/client";
import { HttpError } from "@/server/http";

export function isProductActive(product: Pick<Product, "publicVisible" | "archivedAt" | "availableFrom" | "availableUntil">) {
  const now = new Date();
  return (
    product.publicVisible &&
    !product.archivedAt &&
    (!product.availableFrom || product.availableFrom <= now) &&
    (!product.availableUntil || product.availableUntil >= now)
  );
}

export function calculateAge(birthDate: Date, now = new Date()) {
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDelta = now.getMonth() - birthDate.getMonth();

  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}

export function assertProductAgeAllowed(product: Pick<Product, "minPurchaseAge" | "maxPurchaseAge">, birthDate?: Date) {
  if (product.minPurchaseAge == null && product.maxPurchaseAge == null) {
    return;
  }

  if (!birthDate) {
    throw new HttpError(400, "Birth date is required for this registration tier.");
  }

  const age = calculateAge(birthDate);

  if (product.minPurchaseAge != null && age < product.minPurchaseAge) {
    throw new HttpError(403, "Registrant does not meet the minimum age for this tier.");
  }

  if (product.maxPurchaseAge != null && age > product.maxPurchaseAge) {
    throw new HttpError(403, "Registrant exceeds the maximum age for this tier.");
  }
}
