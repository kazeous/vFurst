import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva("vf-ui-badge inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold", {
  variants: {
    variant: {
      default: "vf-ui-badge-default",
      neutral: "vf-ui-badge-neutral",
      secondary: "vf-ui-badge-neutral",
      success: "vf-ui-badge-success",
      warning: "vf-ui-badge-warning",
      error: "vf-ui-badge-error",
      destructive: "vf-ui-badge-error",
      info: "vf-ui-badge-info"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  label?: React.ReactNode;
}

export function Badge({ className, variant, label, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children ?? label}
    </span>
  );
}
