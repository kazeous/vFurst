"use client";

import type { FormField, FormResponses } from "@/lib/form-fields";
import type { ChangeEvent } from "react";

export function FormFieldInputs({ fields, values, defaults, onValueChange }: {
  fields: FormField[];
  values?: FormResponses;
  defaults?: FormResponses;
  onValueChange?: (fieldId: string, value: string | boolean) => void;
}) {
  return fields.map((field) => {
    if (field.type === "checkbox") {
      return <label key={field.id} className="vf-check">
        <input name={`field-${field.id}`} type="checkbox" value="true"
          {...(onValueChange ? { checked: values?.[field.id] === true, onChange: (event) => onValueChange(field.id, event.target.checked) }
            : { defaultChecked: defaults?.[field.id] === true })} />
        {field.label}
      </label>;
    }

    const inputProps = {
      name: `field-${field.id}`,
      required: field.required,
      ...(onValueChange ? { value: String(values?.[field.id] ?? ""), onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onValueChange(field.id, event.target.value) }
        : { defaultValue: String(defaults?.[field.id] ?? "") })
    };
    if (field.type === "textarea") {
      return <label key={field.id}>{field.label}<textarea {...inputProps} rows={4} /></label>;
    }
    if (field.type === "select") {
      return <label key={field.id}>{field.label}<select {...inputProps}>
        <option value="">Choose one</option>
        {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select></label>;
    }
    return <label key={field.id}>{field.label}<input {...inputProps} /></label>;
  });
}
