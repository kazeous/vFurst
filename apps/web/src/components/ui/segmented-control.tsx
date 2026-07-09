"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type SegmentedControlContextValue = {
  value: string;
  onChange: (value: string) => void;
};

const SegmentedControlContext = React.createContext<SegmentedControlContextValue | null>(null);

export interface SegmentedControlProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export function SegmentedControl({ value, onChange, label, className, children, ...props }: SegmentedControlProps) {
  return (
    <SegmentedControlContext.Provider value={{ value, onChange }}>
      <div className={cn("vf-ui-segmented", className)} role="tablist" aria-label={label} {...props}>
        {children}
      </div>
    </SegmentedControlContext.Provider>
  );
}

export interface SegmentedControlItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string;
  label: React.ReactNode;
}

export function SegmentedControlItem({ value, label, className, ...props }: SegmentedControlItemProps) {
  const context = React.useContext(SegmentedControlContext);
  const selected = context?.value === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={cn("vf-ui-segmented-item", selected ? "vf-ui-segmented-item-active" : undefined, className)}
      onClick={() => context?.onChange(value)}
      {...props}
    >
      {label}
    </button>
  );
}
