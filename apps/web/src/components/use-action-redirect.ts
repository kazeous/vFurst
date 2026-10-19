"use client";

import { useEffect } from "react";

export function useActionRedirect(redirectTo: string | undefined): void {
  useEffect(() => {
    if (redirectTo) window.location.replace(redirectTo);
  }, [redirectTo]);
}
