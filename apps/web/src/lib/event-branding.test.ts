import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_ACCENT,
  accessibleAccentForeground,
  contrastRatio,
  getEffectiveEventBranding,
  mergeEventBranding
} from "./event-branding";

describe("event branding", () => {
  it("preserves unrelated event settings when branding changes", () => {
    expect(
      mergeEventBranding(
        { vendorConfig: { booths: ["A-01"] }, requireApproval: true },
        { accentColor: "#0f766e", logoUrl: "https://example.com/logo.png" }
      )
    ).toMatchObject({
      vendorConfig: { booths: ["A-01"] },
      requireApproval: true,
      branding: { accentColor: "#0f766e", logoUrl: "https://example.com/logo.png" }
    });
  });

  it("falls back to organization identity and the platform accent", () => {
    expect(getEffectiveEventBranding({}, "https://example.com/org.png")).toMatchObject({
      logoUrl: "https://example.com/org.png",
      accentColor: DEFAULT_EVENT_ACCENT
    });
  });

  it.each(["#0f766e", "#f7d154", "#ffffff", "#17201c"])("derives an AA foreground for %s", (accent) => {
    const foreground = accessibleAccentForeground(accent);
    expect(contrastRatio(accent, foreground)).toBeGreaterThanOrEqual(4.5);
  });
});
