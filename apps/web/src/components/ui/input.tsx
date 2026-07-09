"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn("vf-ui-input", className)} {...props} />
));
Input.displayName = "Input";

export interface TextInputProps extends Omit<InputProps, "name" | "onChange"> {
  htmlName?: string;
  label: React.ReactNode;
  hasAutoFocus?: boolean;
  isRequired?: boolean;
  onChange?: (value: string) => void;
}

export function TextInput({ htmlName, label, hasAutoFocus, isRequired, onChange, id, ...props }: TextInputProps) {
  const inputId = id ?? (htmlName ? `field-${htmlName}` : undefined);

  return (
    <label htmlFor={inputId}>
      {label}
      <Input
        id={inputId}
        name={htmlName}
        autoFocus={hasAutoFocus}
        required={isRequired}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        {...props}
      />
    </label>
  );
}
