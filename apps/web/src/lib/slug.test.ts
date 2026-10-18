import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates an event name", () => {
    expect(slugify("vFurstCon 2027")).toBe("vfurstcon-2027");
  });

  it("collapses punctuation and whitespace runs into single hyphens and trims the ends", () => {
    expect(slugify("  Furry Weekend!! -- Saigon  ")).toBe("furry-weekend-saigon");
  });

  it.each([
    ["Hội Chợ Mùa Thu", "hoi-cho-mua-thu"],
    ["Đà Nẵng Fest", "da-nang-fest"],
    ["Café Ünïcode", "cafe-unicode"]
  ])("transliterates accented Latin letters in %j", (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it("drops characters that have no ASCII form", () => {
    expect(slugify("東京 Con 2027")).toBe("con-2027");
    expect(slugify("!!!")).toBe("");
  });

  it("caps the slug at 64 characters without leaving a trailing hyphen", () => {
    expect(slugify("a".repeat(70))).toBe("a".repeat(64));
    expect(slugify("abc ".repeat(20))).toBe(`${"abc-".repeat(15)}abc`);
  });
});
