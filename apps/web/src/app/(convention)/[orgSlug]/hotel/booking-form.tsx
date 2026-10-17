"use client";

import { bookRoom } from "@/actions/hotel-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useActionRedirect } from "@/components/use-action-redirect";
import { initialPublicFormState } from "@/lib/public-form-state";
import { useActionState, useState } from "react";

type RoomTypeOption = { name: string; label: string; soldOut: boolean };

export function HotelBookingForm({
  eventId,
  blockId,
  hotelName,
  cutoffLabel,
  roomTypes,
  defaultGuestName,
  guestEmail
}: {
  eventId: string;
  blockId: string;
  hotelName: string;
  cutoffLabel: string;
  roomTypes: RoomTypeOption[];
  defaultGuestName: string;
  guestEmail: string;
}) {
  const [state, formAction, isPending] = useActionState(bookRoom, initialPublicFormState);
  useActionRedirect(state.redirectTo);
  const busy = isPending || Boolean(state.redirectTo);
  const [roomType, setRoomType] = useState(roomTypes.find((room) => !room.soldOut)?.name ?? roomTypes[0]?.name ?? "");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guestName, setGuestName] = useState(defaultGuestName);

  return (
    <form action={formAction} className="vf-section">
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="blockId" value={blockId} />
      <div>
        <p className="vf-label">Cutoff {cutoffLabel}</p>
        <h2>{hotelName}</h2>
      </div>
      {state.error ? (
        <Alert variant="error" data-testid="hotel-booking-error">
          {state.error}
        </Alert>
      ) : null}
      <label>
        Room type
        <select name="roomType" required value={roomType} onChange={(event) => setRoomType(event.target.value)}>
          {roomTypes.map((room) => (
            <option key={room.name} value={room.name} disabled={room.soldOut}>
              {room.label}
            </option>
          ))}
        </select>
      </label>
      <div className="vf-form-grid">
        <label>
          Check-in
          <input name="checkIn" type="date" required value={checkIn} onChange={(event) => setCheckIn(event.target.value)} />
        </label>
        <label>
          Check-out
          <input name="checkOut" type="date" required value={checkOut} onChange={(event) => setCheckOut(event.target.value)} />
        </label>
      </div>
      <div className="vf-form-grid">
        <label>
          Guest name
          <input name="guestName" required value={guestName} onChange={(event) => setGuestName(event.target.value)} />
        </label>
        <label>
          Guest email
          <input name="guestEmail" type="email" defaultValue={guestEmail} readOnly required />
        </label>
      </div>
      <Button label={busy ? "Submitting..." : "Continue to checkout"} type="submit" variant="primary" isDisabled={busy} />
    </form>
  );
}
