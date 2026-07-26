"use client";

import { submitApplication } from "@/actions/vendor-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { initialPublicFormState } from "@/lib/public-form-state";
import { useActionState, useState } from "react";

type TableTypeOption = { id: string; label: string };
type AmenityOption = { id: string; label: string };
type AssistantRow = { name: string; email: string };

export function VendorApplyForm({
  orgSlug,
  eventName,
  eventDescription,
  tableTypes,
  amenities,
  defaultContactName,
  contactEmail
}: {
  orgSlug: string;
  eventName: string;
  eventDescription: string;
  tableTypes: TableTypeOption[];
  amenities: AmenityOption[];
  defaultContactName: string;
  contactEmail: string;
}) {
  const [state, formAction, isPending] = useActionState(submitApplication, initialPublicFormState);
  const [contactName, setContactName] = useState(defaultContactName);
  const [businessName, setBusinessName] = useState("");
  const [website, setWebsite] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [neighborPreference, setNeighborPreference] = useState("");
  const [locationPreference, setLocationPreference] = useState("");
  const [selectedAmenities, setSelectedAmenities] = useState<Record<string, boolean>>({});
  const [assistants, setAssistants] = useState<AssistantRow[]>([
    { name: "", email: "" },
    { name: "", email: "" },
    { name: "", email: "" }
  ]);
  const [fileUrl, setFileUrl] = useState("");

  const setAssistantRow = (index: number, patch: Partial<AssistantRow>) => {
    setAssistants((rows) => rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  };

  return (
    <form action={formAction} className="vf-section vf-form">
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <div>
        <p className="vf-label">{eventName}</p>
        <h2>Apply for dealer space</h2>
        <p className="vf-muted">{eventDescription}</p>
      </div>
      {state.error ? (
        <Alert variant="error" data-testid="vendor-error">
          {state.error}
        </Alert>
      ) : null}
      <div className="vf-form-grid">
        <label>
          Contact name
          <input name="contactName" required value={contactName} onChange={(event) => setContactName(event.target.value)} />
        </label>
        <label>
          Contact email
          <input name="contactEmail" type="email" defaultValue={contactEmail} readOnly required />
        </label>
      </div>
      <div className="vf-form-grid">
        <label>
          Business name
          <input name="businessName" required value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
        </label>
        <label>
          Website
          <input name="website" placeholder="https://..." value={website} onChange={(event) => setWebsite(event.target.value)} />
        </label>
      </div>
      <label>
        Product description
        <textarea
          name="productDescription"
          rows={4}
          required
          value={productDescription}
          onChange={(event) => setProductDescription(event.target.value)}
        />
      </label>
      <div className="vf-form-grid">
        <label>
          Table type
          <select name="tableType" defaultValue={tableTypes[0]?.id ?? ""}>
            <option value="">No table selected</option>
            {tableTypes.map((table) => (
              <option key={table.id} value={table.id}>
                {table.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Neighbor preference
          <input
            name="neighborPreference"
            placeholder="Near / away from..."
            value={neighborPreference}
            onChange={(event) => setNeighborPreference(event.target.value)}
          />
        </label>
        <label>
          Location preference
          <input
            name="locationPreference"
            placeholder="End cap, wall, quiet area"
            value={locationPreference}
            onChange={(event) => setLocationPreference(event.target.value)}
          />
        </label>
      </div>
      <section className="vf-stack">
        <h2>Amenities</h2>
        {amenities.map((amenity) => (
          <label key={amenity.id} className="vf-check">
            <input
              name="amenityId"
              type="checkbox"
              value={amenity.id}
              checked={selectedAmenities[amenity.id] ?? false}
              onChange={(event) => setSelectedAmenities((current) => ({ ...current, [amenity.id]: event.target.checked }))}
            />
            {amenity.label}
          </label>
        ))}
        {amenities.length === 0 ? <p className="vf-empty">No paid amenities are configured.</p> : null}
      </section>
      <section className="vf-stack">
        <h2>Dealer assistants</h2>
        {assistants.map((assistant, index) => (
          <div key={index} className="vf-subform-row">
            <label>
              Assistant name
              <input name="assistantName" value={assistant.name} onChange={(event) => setAssistantRow(index, { name: event.target.value })} />
            </label>
            <label>
              Assistant email
              <input
                name="assistantEmail"
                type="email"
                value={assistant.email}
                onChange={(event) => setAssistantRow(index, { email: event.target.value })}
              />
            </label>
          </div>
        ))}
      </section>
      <section className="vf-stack">
        <h2>Files</h2>
        <div className="vf-subform-row">
          <label>
            File URL
            <input name="fileUrl" placeholder="https://..." value={fileUrl} onChange={(event) => setFileUrl(event.target.value)} />
          </label>
          <label>
            Upload file
            <input name="fileUpload" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
          </label>
        </div>
      </section>
      <Button label={isPending ? "Submitting..." : "Submit vendor application"} type="submit" variant="primary" isDisabled={isPending} />
    </form>
  );
}
