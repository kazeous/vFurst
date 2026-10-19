const maxSlugLength = 64;

/**
 * Suggests an event slug from its display name: lowercase ASCII words joined
 * by single hyphens. The server-side event schema stays the authority.
 */
export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    // Vietnamese đ has no Unicode decomposition to a base letter.
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, maxSlugLength)
    .replace(/-+$/, "");
}
