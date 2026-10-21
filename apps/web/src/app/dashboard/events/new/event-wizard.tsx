"use client";

import { createEventWithRegistrationTypes } from "@/actions/event-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { EventNameSlugFields } from "@/components/forms/event-name-slug-fields";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import { useState } from "react";

type OrgOption = {
  id: string;
  name: string;
};

const steps = [
  { id: "basic", label: "Basic" },
  { id: "tiers", label: "Tiers" },
  { id: "settings", label: "Settings" },
  { id: "review", label: "Review" }
] as const;

type Step = (typeof steps)[number]["id"];

export function EventWizard({ organizations }: { organizations: OrgOption[] }) {
  const [step, setStep] = useState<Step>("basic");
  const [currency, setCurrency] = useState<"USD" | "VND">("USD");

  return (
    <ActionStateForm
      action={createEventWithRegistrationTypes}
      className="vf-section vf-wizard"
      errorTestId="event-wizard-error"
    >
      <SegmentedControl value={step} onChange={(value) => setStep(value as Step)} label="Event creation step">
        {steps.map((item) => (
          <SegmentedControlItem key={item.id} value={item.id} label={item.label} />
        ))}
      </SegmentedControl>

      <div className={step === "basic" ? "vf-step" : "vf-step vf-hidden"}>
        <label>
          Organization
          <select name="orgId" required>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Event currency
          <select name="currency" value={currency} onChange={(event) => setCurrency(event.target.value as "USD" | "VND")} required>
            <option value="USD">USD - US dollars</option>
            <option value="VND">VND - Vietnamese dong</option>
          </select>
        </label>
        <EventNameSlugFields nameLabel="Event name" />
        <label>
          Description
          <textarea name="description" rows={4} placeholder="A concise public event description." />
        </label>
        <label>
          Venue
          <input name="venue" placeholder="Convention Center" />
        </label>
        <div className="vf-form-grid">
          <label>
            Start date
            <DateField name="startDate" required />
          </label>
          <label>
            End date
            <DateField name="endDate" required />
          </label>
        </div>
      </div>

      <div className={step === "tiers" ? "vf-step" : "vf-step vf-hidden"}>
        {[0, 1, 2].map((index) => (
          <div key={index} className="vf-subform-row">
            <label>
              Tier name
              <input name="tierName" placeholder={index === 0 ? "General Admission" : "VIP"} required={index === 0} />
            </label>
            <label>
              Price
              <input
                name="tierPrice"
                type="number"
                min="0"
                step={currency === "USD" ? "0.01" : "1"}
                placeholder={currency === "USD" ? "75.00" : "1500000"}
                required={index === 0}
              />
            </label>
            <label>
              Capacity
              <input name="tierCapacity" type="number" min="1" placeholder="500" />
            </label>
          </div>
        ))}
      </div>

      <div className={step === "settings" ? "vf-step" : "vf-step vf-hidden"}>
        <label className="vf-check">
          <input name="requireApproval" type="checkbox" />
          Require manual approval
        </label>
        <label className="vf-check">
          <input name="allowTransfers" type="checkbox" defaultChecked value="on" />
          Allow attendee transfers
        </label>
        <label>
          Max registrations per user
          <input name="maxRegistrationsPerUser" type="number" min="1" max="20" defaultValue="4" />
        </label>
        <label className="vf-check">
          <input name="publishNow" type="checkbox" />
          Publish when created
        </label>
      </div>

      <div className={step === "review" ? "vf-step" : "vf-step vf-hidden"}>
        <p className="vf-muted">Create the event, tiers, pricing defaults, and settings. You can refine scheduled pricing and add-ons from the event workspace.</p>
      </div>

      <div className="vf-actions">
        <Button label="Basic" type="button" onClick={() => setStep("basic")} />
        <Button label="Tiers" type="button" onClick={() => setStep("tiers")} />
        <Button label="Settings" type="button" onClick={() => setStep("settings")} />
        <Button label="Review" type="button" onClick={() => setStep("review")} />
        <Button label="Create event" type="submit" variant="primary" />
      </div>
    </ActionStateForm>
  );
}
