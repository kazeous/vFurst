"use client";

import { EmergencyContactRows } from "@/components/forms/emergency-contact-rows";
import { FormFieldInputs } from "@/components/forms/form-field-inputs";
import { Button } from "@/components/ui/button";
import type { ContactDraft } from "@/lib/emergency-contacts";
import type { FormResponses } from "@/lib/form-fields";
import { readRegistrationDetails, type RegistrationDetails, type RegistrationForm } from "@/lib/registration-form";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function DetailsStep({ form, fullName, stepLabel, drafts, responses, onContactsChange, onValueChange, onBack, onContinue }: {
  form: RegistrationForm;
  fullName: string;
  stepLabel: string;
  drafts: ContactDraft[];
  responses: FormResponses;
  onContactsChange: (drafts: ContactDraft[]) => void;
  onValueChange: (fieldId: string, value: string | boolean) => void;
  onBack: () => void;
  onContinue: (details: RegistrationDetails) => void;
}) {
  const formData = new FormData();
  drafts.forEach((draft, index) => Object.entries(draft).forEach(([field, value]) => formData.set(`contact-${index}-${field}`, value)));
  Object.entries(responses).forEach(([id, value]) => {
    if (value !== false) formData.set(`field-${id}`, String(value));
  });
  const result = readRegistrationDetails(form, formData);

  return <div className="vf-stack">
    <div><p className="vf-label">{stepLabel}</p><h2 id="registration-flow-title">Additional details</h2><p className="vf-muted">The organizer asks for this information.</p></div>
    <EmergencyContactRows legend={`Emergency contacts for ${fullName}`} requirement={form.contacts} drafts={drafts} onChange={onContactsChange} />
    {form.contacts.mode !== "off" ? <p className="vf-muted">Saved to this attendee&apos;s profile for future registrations.</p> : null}
    <FormFieldInputs fields={form.questions} values={responses} onValueChange={onValueChange} />
    {!result.ok ? <p className="vf-muted" role="status">{result.error}</p> : null}
    <div className="vf-registration-actions"><Button type="button" onClick={onBack}><ChevronLeft size={16} />Back</Button><Button type="button" variant="primary" disabled={!result.ok} onClick={() => { if (result.ok) onContinue(result.details); }}>Continue <ChevronRight size={16} /></Button></div>
  </div>;
}
