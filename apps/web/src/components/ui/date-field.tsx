"use client";

import { formatDayFirstDate, parseDayFirstDate } from "@/lib/date-input";
import { useEffect, useRef, useState } from "react";

const invalidDateMessage = "Enter the date as dd/mm/yyyy.";

type DateFieldProps = {
  name: string;
  required?: boolean;
  /** Uncontrolled starting value as ISO yyyy-mm-dd; a form reset restores it. */
  defaultValue?: string;
  /** Controlled value as ISO yyyy-mm-dd, "" while empty or not yet a whole date. */
  value?: string;
  onValueChange?: (value: string) => void;
};

/**
 * Shows and accepts dd/mm/yyyy whatever the browser locale, and submits the ISO
 * yyyy-mm-dd value under `name` the way a native date input does. Render it
 * inside the field's <label>.
 */
export function DateField({ name, required, defaultValue = "", value, onValueChange }: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isControlled = value !== undefined;
  // What the person typed since the field last showed its stored value.
  const [draft, setDraft] = useState<string | null>(null);

  let text: string;
  if (isControlled) {
    text = draft !== null && (parseDayFirstDate(draft) ?? "") === value ? draft : formatDayFirstDate(value);
  } else {
    text = draft ?? formatDayFirstDate(defaultValue);
  }
  const isoValue = parseDayFirstDate(text);
  const isInvalid = text.trim() !== "" && isoValue === null;

  useEffect(() => {
    inputRef.current?.setCustomValidity(isInvalid ? invalidDateMessage : "");
  }, [isInvalid]);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form || isControlled) return;

    const restoreDefault = () => setDraft(null);
    form.addEventListener("reset", restoreDefault);
    return () => form.removeEventListener("reset", restoreDefault);
  }, [isControlled]);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        required={required}
        value={text}
        onChange={(event) => {
          setDraft(event.target.value);
          onValueChange?.(parseDayFirstDate(event.target.value) ?? "");
        }}
        onBlur={() => {
          if (draft !== null && isoValue) setDraft(formatDayFirstDate(isoValue));
        }}
      />
      <input type="hidden" name={name} value={isoValue ?? ""} />
    </>
  );
}
