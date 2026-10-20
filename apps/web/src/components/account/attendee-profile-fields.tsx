import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";

export function AttendeeProfileFields({ defaults, compact = false }: {
  defaults?: { fullName?: string; badgeName?: string | null; dateOfBirth?: string | null; email?: string | null; phone?: string | null };
  compact?: boolean;
}) {
  return (
    <div className="vf-form-grid">
      <label>Full name<Input name="fullName" defaultValue={defaults?.fullName ?? ""} maxLength={120} autoComplete="name" required /></label>
      <label>Badge name <span className="vf-optional">Optional</span><Input name="badgeName" defaultValue={defaults?.badgeName ?? ""} maxLength={32} /></label>
      <label>Date of birth <span className="vf-optional">Optional</span><DateField name="dateOfBirth" defaultValue={defaults?.dateOfBirth ?? ""} /></label>
      {!compact ? <>
        <label>Contact email <span className="vf-optional">Optional</span><Input name="email" type="email" defaultValue={defaults?.email ?? ""} autoComplete="email" /></label>
        <label>Phone <span className="vf-optional">Optional</span><Input name="phone" type="tel" defaultValue={defaults?.phone ?? ""} maxLength={32} autoComplete="tel" /></label>
      </> : null}
    </div>
  );
}
