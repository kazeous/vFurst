export function pickInitialAttendee(
  attendees: Array<{ id: string; registered: boolean; isAccountHolder: boolean }>,
  requestedId: string | null
): string | null {
  const free = attendees.filter((attendee) => !attendee.registered);
  return free.find((attendee) => attendee.id === requestedId)?.id
    ?? free.find((attendee) => attendee.isAccountHolder)?.id
    ?? free[0]?.id
    ?? null;
}
