"use client";

import { RouteError } from "@/components/route-error";

export default function MarketingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} homeHref="/" homeLabel="Back to home" />;
}
