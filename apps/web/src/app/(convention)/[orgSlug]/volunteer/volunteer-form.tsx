"use client";

import { submitVolunteerApplication } from "@/actions/staff-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useActionRedirect } from "@/components/use-action-redirect";
import { initialPublicFormState } from "@/lib/public-form-state";
import { useActionState, useState } from "react";

type Department = { id: string; name: string };
type FormField = { id: string; type: "text" | "select" | "checkbox" | "textarea"; label: string; required: boolean; options?: string[] };
type AvailabilityRow = { date: string; slots: string };

export function VolunteerForm({
  orgSlug,
  eventName,
  eventDescription,
  departments,
  fields,
  defaultApplicantName,
  applicantEmail
}: {
  orgSlug: string;
  eventName: string;
  eventDescription: string;
  departments: Department[];
  fields: FormField[];
  defaultApplicantName: string;
  applicantEmail: string;
}) {
  const [state, formAction, isPending] = useActionState(submitVolunteerApplication, initialPublicFormState);
  useActionRedirect(state.redirectTo);
  const busy = isPending || Boolean(state.redirectTo);
  const [applicantName, setApplicantName] = useState(defaultApplicantName);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [fieldChecks, setFieldChecks] = useState<Record<string, boolean>>({});
  const [availability, setAvailability] = useState<AvailabilityRow[]>([
    { date: "", slots: "" },
    { date: "", slots: "" },
    { date: "", slots: "" }
  ]);

  const setAvailabilityRow = (index: number, patch: Partial<AvailabilityRow>) => {
    setAvailability((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  return (
    <form action={formAction} className="vf-section vf-form">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <div>
        <p className="vf-label">{eventName}</p>
        <h2>Volunteer application</h2>
        <p className="vf-muted">{eventDescription}</p>
      </div>
      {state.error ? (
        <Alert variant="error" data-testid="volunteer-error">
          {state.error}
        </Alert>
      ) : null}
      <div className="vf-form-grid">
        <label>
          Full name
          <input name="applicantName" required value={applicantName} onChange={(event) => setApplicantName(event.target.value)} />
        </label>
        <label>
          Email
          <input name="applicantEmail" type="email" defaultValue={applicantEmail} readOnly required />
        </label>
      </div>
      <div className="vf-form-grid">
        <label>
          First choice
          <select name="departmentId" required defaultValue={departments[0]?.id}>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Second choice
          <select name="preference2" defaultValue="">
            <option value="">No preference</option>
            {departments.map((department) => (
              <option key={department.id} value={department.name}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Third choice
          <select name="preference3" defaultValue="">
            <option value="">No preference</option>
            {departments.map((department) => (
              <option key={department.id} value={department.name}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {fields.map((field) => {
        if (field.type === "checkbox") {
          return (
            <label key={field.id} className="vf-check">
              <input
                name={`field-${field.id}`}
                type="checkbox"
                value="true"
                checked={fieldChecks[field.id] ?? false}
                onChange={(event) => setFieldChecks((checks) => ({ ...checks, [field.id]: event.target.checked }))}
              />
              {field.label}
            </label>
          );
        }

        if (field.type === "textarea") {
          return (
            <label key={field.id}>
              {field.label}
              <textarea
                name={`field-${field.id}`}
                rows={4}
                required={field.required}
                value={fieldValues[field.id] ?? ""}
                onChange={(event) => setFieldValues((values) => ({ ...values, [field.id]: event.target.value }))}
              />
            </label>
          );
        }

        if (field.type === "select") {
          return (
            <label key={field.id}>
              {field.label}
              <select
                name={`field-${field.id}`}
                required={field.required}
                value={fieldValues[field.id] ?? ""}
                onChange={(event) => setFieldValues((values) => ({ ...values, [field.id]: event.target.value }))}
              >
                <option value="">Choose one</option>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        return (
          <label key={field.id}>
            {field.label}
            <input
              name={`field-${field.id}`}
              required={field.required}
              value={fieldValues[field.id] ?? ""}
              onChange={(event) => setFieldValues((values) => ({ ...values, [field.id]: event.target.value }))}
            />
          </label>
        );
      })}
      <section className="vf-stack">
        <h2>Availability</h2>
        {availability.map((row, index) => (
          <div key={index} className="vf-subform-row">
            <label>
              Date
              <input
                name="availabilityDate"
                type="date"
                value={row.date}
                onChange={(event) => setAvailabilityRow(index, { date: event.target.value })}
              />
            </label>
            <label>
              Slots
              <input
                name="availabilitySlots"
                placeholder="morning, afternoon, evening"
                value={row.slots}
                onChange={(event) => setAvailabilityRow(index, { slots: event.target.value })}
              />
            </label>
          </div>
        ))}
      </section>
      <Button label={busy ? "Submitting..." : "Submit application"} type="submit" variant="primary" isDisabled={busy} />
    </form>
  );
}
