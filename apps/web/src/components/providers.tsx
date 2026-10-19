"use client";

import { TooltipProvider } from "@/components/ui/tooltip";
import type { ReactNode } from "react";

export function Providers({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
  );
}
