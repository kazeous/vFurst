import * as React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function EmptyState({ title, description, actions, className, ...props }: EmptyStateProps) {
  return (
    <div className={cn("vf-ui-empty", className)} {...props}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actions ? <div className="vf-actions">{actions}</div> : null}
    </div>
  );
}
