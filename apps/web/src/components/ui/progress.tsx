import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressBarProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  label?: string;
  isLabelHidden?: boolean;
}

export function ProgressBar({ value, label, isLabelHidden, className, ...props }: ProgressBarProps) {
  const normalized = Math.min(Math.max(value, 0), 100);

  return (
    <div className={cn("vf-ui-progress-wrap", className)} {...props}>
      {label ? <span className={isLabelHidden ? "sr-only" : undefined}>{label}</span> : null}
      <div className="vf-ui-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={normalized}>
        <span style={{ width: `${normalized}%` }} />
      </div>
    </div>
  );
}
