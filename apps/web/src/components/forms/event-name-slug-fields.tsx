"use client";

import { slugify } from "@/lib/slug";
import { useState } from "react";

/**
 * Event name and slug inputs. The slug follows the name until the organizer
 * types their own, and follows it again once they clear it. The server's event
 * schema still validates whatever is submitted.
 */
export function EventNameSlugFields({ nameLabel }: { nameLabel: string }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugEdited, setIsSlugEdited] = useState(false);

  return (
    <>
      <label>
        {nameLabel}
        <input
          name="name"
          required
          placeholder="vFurstCon 2027"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!isSlugEdited) setSlug(slugify(event.target.value));
          }}
        />
      </label>
      <label>
        Slug
        <input
          name="slug"
          required
          placeholder="vfurstcon-2027"
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value);
            setIsSlugEdited(event.target.value !== "");
          }}
        />
      </label>
    </>
  );
}
