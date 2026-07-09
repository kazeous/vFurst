import * as React from "react";
import { cn } from "@/lib/utils";

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
}

export function Divider({ className, label, ...props }: DividerProps) {
  return (
    <div className={cn("vf-divider", className)} role="separator" {...props}>
      {label ? <span>{label}</span> : null}
    </div>
  );
}
