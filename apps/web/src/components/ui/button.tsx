"use client";

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "vf-ui-button inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "vf-ui-button-secondary",
        primary: "vf-ui-button-primary",
        secondary: "vf-ui-button-secondary",
        destructive: "vf-ui-button-destructive",
        outline: "vf-ui-button-outline",
        ghost: "vf-ui-button-ghost",
        link: "vf-ui-button-link"
      },
      size: {
        default: "vf-ui-button-default-size",
        sm: "vf-ui-button-sm",
        lg: "vf-ui-button-lg",
        icon: "vf-ui-button-icon"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

type NativeButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;
type LinkButtonProps = Omit<React.ComponentProps<typeof Link>, "href" | "className" | "children">;

export interface ButtonProps extends NativeButtonProps, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  href?: string;
  label?: React.ReactNode;
  isDisabled?: boolean;
  linkProps?: LinkButtonProps;
}

export const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  ({ asChild = false, className, variant, size, href, label, isDisabled, disabled, children, linkProps, ...props }, ref) => {
    const content = children ?? label;
    const classes = cn(buttonVariants({ variant, size }), className);

    if (href) {
      return (
        <Link
          ref={ref as React.ForwardedRef<HTMLAnchorElement>}
          href={href}
          className={cn(classes, isDisabled || disabled ? "pointer-events-none opacity-50" : undefined)}
          aria-disabled={isDisabled || disabled || undefined}
          {...linkProps}
        >
          {content}
        </Link>
      );
    }

    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref as React.ForwardedRef<HTMLButtonElement>}
        className={classes}
        disabled={isDisabled || disabled}
        {...props}
      >
        {content}
      </Comp>
    );
  }
);
Button.displayName = "Button";
