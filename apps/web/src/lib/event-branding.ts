import type { Prisma } from "@vfurst/db";
import { z } from "zod";

export const DEFAULT_EVENT_ACCENT = "#0f766e";

export type EventBranding = {
  logoUrl?: string;
  coverImageUrl?: string;
  accentColor?: `#${string}`;
};

export type EffectiveEventBranding = Required<Pick<EventBranding, "accentColor">> & {
  logoUrl?: string;
  coverImageUrl?: string;
  accentForeground: "#ffffff" | "#17201c" | "#000000";
};

export const eventBrandingSchema = z.object({
  logoUrl: z.string().trim().url().optional().or(z.literal("")),
  coverImageUrl: z.string().trim().url().optional().or(z.literal("")),
  accentColor: z.string().trim().toLowerCase().regex(/^#[0-9a-f]{6}$/, "Use a six-digit hex color.").optional()
});

function settingsObject(settings: Prisma.JsonValue): Prisma.JsonObject {
  return settings && typeof settings === "object" && !Array.isArray(settings) ? (settings as Prisma.JsonObject) : {};
}

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : DEFAULT_EVENT_ACCENT.slice(1);
  const red = channel(Number.parseInt(normalized.slice(0, 2), 16));
  const green = channel(Number.parseInt(normalized.slice(2, 4), 16));
  const blue = channel(Number.parseInt(normalized.slice(4, 6), 16));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(first: string, second: string) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

export function accessibleAccentForeground(accent: string): EffectiveEventBranding["accentForeground"] {
  const whiteContrast = contrastRatio(accent, "#ffffff");
  const inkContrast = contrastRatio(accent, "#17201c");

  if (whiteContrast >= 4.5 && whiteContrast >= inkContrast) return "#ffffff";
  if (inkContrast >= 4.5) return "#17201c";
  return "#000000";
}

export function getStoredEventBranding(settings: Prisma.JsonValue): EventBranding {
  const value = settingsObject(settings).branding;
  const parsed = eventBrandingSchema.safeParse(value);

  if (!parsed.success) return {};

  return {
    logoUrl: parsed.data.logoUrl || undefined,
    coverImageUrl: parsed.data.coverImageUrl || undefined,
    accentColor: parsed.data.accentColor as `#${string}` | undefined
  };
}

export function getEffectiveEventBranding(settings: Prisma.JsonValue, organizationLogo?: string | null): EffectiveEventBranding {
  const stored = getStoredEventBranding(settings);
  const accentColor = stored.accentColor ?? DEFAULT_EVENT_ACCENT;

  return {
    logoUrl: stored.logoUrl ?? organizationLogo ?? undefined,
    coverImageUrl: stored.coverImageUrl,
    accentColor,
    accentForeground: accessibleAccentForeground(accentColor)
  };
}

export function mergeEventBranding(settings: Prisma.JsonValue, branding: EventBranding): Prisma.JsonObject {
  const parsed = eventBrandingSchema.parse({
    logoUrl: branding.logoUrl ?? "",
    coverImageUrl: branding.coverImageUrl ?? "",
    accentColor: branding.accentColor ?? DEFAULT_EVENT_ACCENT
  });

  return {
    ...settingsObject(settings),
    branding: {
      logoUrl: parsed.logoUrl || undefined,
      coverImageUrl: parsed.coverImageUrl || undefined,
      accentColor: parsed.accentColor
    }
  };
}
