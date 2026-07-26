"use client";

import { RouteError } from "@/components/route-error";

export default function ConventionPortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // No absolute home link: portal paths differ between tenant hosts and the
  // central /{orgSlug} prefix, so history back is the only safe escape here.
  return <RouteError error={error} reset={reset} />;
}
