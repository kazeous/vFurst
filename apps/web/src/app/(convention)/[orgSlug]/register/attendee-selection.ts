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

export type AttendeeRefreshResult = { profileId: string; ok: boolean };

export function attendeeRefreshState(
  profileId: string | undefined,
  result: AttendeeRefreshResult | null
): { loading: boolean; loadFailed: boolean } {
  return {
    loading: Boolean(profileId) && result?.profileId !== profileId,
    loadFailed: Boolean(profileId) && result?.profileId === profileId && !result?.ok
  };
}
