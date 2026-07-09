import * as React from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: number;
  maxWidth?: number;
}

export function Card({ className, padding, maxWidth, style, ...props }: CardProps) {
  return (
    <div
      className={cn("vf-ui-card", padding ? `vf-ui-card-padding-${Math.min(Math.max(padding, 0), 6)}` : undefined, className)}
      style={{ maxWidth, ...style }}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("vf-ui-card-header", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("vf-ui-card-title", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("vf-ui-card-description", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("vf-ui-card-content", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("vf-ui-card-footer", className)} {...props} />;
}
