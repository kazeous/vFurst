import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type AlertVariant = "info" | "success" | "warning" | "error";

const icons = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: CircleAlert
};

export function Alert({ variant = "info", className, children, ...props }: HTMLAttributes<HTMLDivElement> & { variant?: AlertVariant }) {
  const Icon = icons[variant];

  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("vf-alert", `vf-alert-${variant}`, className)} {...props}>
      <Icon aria-hidden="true" size={18} />
      <div>{children}</div>
    </div>
  );
}
