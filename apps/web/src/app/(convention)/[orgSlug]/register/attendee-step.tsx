"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createAttendeeProfile } from "@/actions/attendee-profile-actions";
import { AttendeeProfileFields } from "@/components/account/attendee-profile-fields";
import { usePortalGateAccount } from "@/components/account/portal-account-gate";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useActionRedirect } from "@/components/use-action-redirect";
import { initialAttendeeProfileFormState } from "@/lib/attendee-profile-form-state";
import { pickInitialAttendee } from "./attendee-selection";

export type AttendeeChoice = { id: string; fullName: string; badgeName: string | null; isAccountHolder: boolean; registered: boolean };
type AttendeeList = { cap: number; used: number; attendees: AttendeeChoice[] };

export function AttendeeStep({ eventId, selectedId, onSelectionChange }: {
  eventId: string;
  selectedId: string | null;
  onSelectionChange: (attendee: AttendeeChoice | null, canContinue: boolean) => void;
}) {
  const account = usePortalGateAccount();
  const [list, setList] = useState<AttendeeList | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [state, action, pending] = useActionState(createAttendeeProfile, initialAttendeeProfileFormState);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  useActionRedirect(state.redirectTo);

  useEffect(() => {
    const controller = new AbortController();
    const requested = state.profileId ?? selectedRef.current ?? new URL(window.location.href).searchParams.get("attendee");
    setList(null);
    setLoadFailed(false);
    onSelectionChange(null, false);
    fetch(`/api/portal/attendees?eventId=${encodeURIComponent(eventId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Attendees unavailable");
        const result = await response.json() as AttendeeList;
        if (!Array.isArray(result.attendees)) throw new Error("Attendees unavailable");
        if (controller.signal.aborted) return;
        const id = pickInitialAttendee(result.attendees, requested);
        const selected = result.attendees.find((attendee) => attendee.id === id) ?? null;
        setList(result);
        onSelectionChange(selected, Boolean(selected) && result.used < result.cap);
        if (state.profileId) setIsAdding(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, [eventId, account.email, state.profileId, onSelectionChange]);

  return (
    <div className="vf-stack">
      <div><p className="vf-label">Step 2 of 3</p><h2 id="registration-flow-title">Attendee details</h2><p className="vf-muted">Choose who is attending, or add another attendee.</p></div>
      {loadFailed ? <Alert variant="error">Attendees could not be loaded. Refresh the page to try again.</Alert> : !list ? <p role="status">Loading attendees…</p> : <>
        <p>{list.used} of {list.cap} attendees registered for this event.</p>
        {list.used >= list.cap ? <Alert>This account has registered the maximum number of attendees for this event.</Alert> : null}
        <fieldset className="vf-action-state-fields">
          <legend>Who is attending?</legend>
          <div className="vf-public-tier-list">
            {list.attendees.map((attendee) => (
              <label key={attendee.id} data-selected={selectedId === attendee.id || undefined} data-disabled={attendee.registered || undefined}>
                <input type="radio" name="attendee-choice" value={attendee.id} checked={selectedId === attendee.id} disabled={attendee.registered}
                  onChange={() => onSelectionChange(attendee, list.used < list.cap)} />
                <span><strong>{attendee.fullName}</strong>{attendee.badgeName ? <small>Badge: {attendee.badgeName}</small> : null}
                  {attendee.isAccountHolder ? <small>Account holder</small> : null}{attendee.registered ? <small>Already registered</small> : null}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </>}
      {isAdding ? <form action={action} className="vf-form">
        <input type="hidden" name="context" value="wizard" />
        {state.error ? <Alert variant="error">{state.error}</Alert> : null}
        <fieldset className="vf-action-state-fields" disabled={pending}>
          <AttendeeProfileFields compact />
          <div className="vf-actions"><Button type="submit" variant="primary" disabled={pending}>Add attendee</Button><Button type="button" disabled={pending} onClick={() => setIsAdding(false)}>Cancel</Button></div>
        </fieldset>
      </form> : <Button type="button" onClick={() => setIsAdding(true)}>Add another attendee</Button>}
    </div>
  );
}

export function TransferAttendeeSelection({ attendees, initialId }: { attendees: AttendeeChoice[]; initialId: string }) {
  const [selected, setSelected] = useState(initialId);
  return (
    <div className="vf-stack">
      <fieldset className="vf-action-state-fields">
        <legend>Who will attend?</legend>
        {attendees.map((attendee) => <label key={attendee.id}>
          <input type="radio" name="attendeeProfileId" value={attendee.id} checked={selected === attendee.id} onChange={() => setSelected(attendee.id)} />
          {attendee.fullName}{attendee.isAccountHolder ? " · Account holder" : ""}
        </label>)}
        <label><input type="radio" name="attendeeProfileId" value="new" checked={selected === "new"} onChange={() => setSelected("new")} />New attendee</label>
      </fieldset>
      <fieldset className="vf-action-state-fields" disabled={selected !== "new"} aria-describedby="new-attendee-note">
        <p id="new-attendee-note" className="vf-muted">Used only when New attendee is selected.</p>
        <AttendeeProfileFields compact />
      </fieldset>
    </div>
  );
}
