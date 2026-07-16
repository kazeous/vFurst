"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <SessionProvider>
      <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
    </SessionProvider>
  );
}
