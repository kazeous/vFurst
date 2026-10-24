"use client";

import { DIAL_CODES } from "@/lib/dial-codes";
import type { ContactDraft, ContactsRequirement } from "@/lib/emergency-contacts";
import type { ChangeEvent } from "react";

export function EmergencyContactRows({ legend, requirement, drafts, onChange }: {
  legend: string;
  requirement: ContactsRequirement;
  drafts: ContactDraft[];
  onChange?: (drafts: ContactDraft[]) => void;
}) {
  if (requirement.mode === "off") return null;
  return <fieldset className="vf-action-state-fields vf-stack">
    <legend>{legend}</legend>
    {drafts.slice(0, requirement.count).map((draft, index) => {
      const required = requirement.mode === "required" && index === 0;
      const optionalHint = required ? null : <span className="vf-optional">Optional</span>;
      const propsFor = (field: keyof ContactDraft) => ({
        name: `contact-${index}-${field}`,
        required,
        ...(onChange ? { value: draft[field], onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange(drafts.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: event.target.value } : row)) }
          : { defaultValue: draft[field] })
      });
      return <div className="vf-form-grid" key={index}>
        <label>Contact {index + 1} name {optionalHint}<input {...propsFor("name")} maxLength={120} /></label>
        <label>Contact {index + 1} country {optionalHint}<select {...propsFor("country")}>
          {DIAL_CODES.map((dial) => <option key={dial.country} value={dial.country}>{dial.name} (+{dial.dialCode})</option>)}
        </select></label>
        <label>Contact {index + 1} phone {optionalHint}<input {...propsFor("number")} type="tel" /></label>
      </div>;
    })}
  </fieldset>;
}
