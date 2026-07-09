import * as React from "react";
import { cn } from "@/lib/utils";

export function FormLayout({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("vf-form", className)} {...props} />;
}
