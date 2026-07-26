"use client";

import { RouteError } from "@/components/route-error";

export default function PlatformError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteError error={error} reset={reset} homeHref="/platform" homeLabel="Back to platform overview" />;
}
