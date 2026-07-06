export function volunteerShiftAssignmentTemplate({
  eventName,
  volunteerName,
  roleName,
  shiftLabel
}: {
  eventName: string;
  volunteerName: string | null;
  roleName: string;
  shiftLabel: string;
}) {
  const greeting = volunteerName ? `Hi ${volunteerName},` : "Hi,";

  return {
    subject: `Volunteer shift assigned for ${eventName}`,
    html: `<p>${greeting}</p><p>You have been assigned to ${roleName} for ${eventName}.</p><p>${shiftLabel}</p>`,
    text: `${greeting}\n\nYou have been assigned to ${roleName} for ${eventName}.\n\n${shiftLabel}`
  };
}
