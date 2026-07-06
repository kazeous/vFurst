export function volunteerApplicationDecisionTemplate({
  eventName,
  applicantName,
  status,
  reason
}: {
  eventName: string;
  applicantName: string | null;
  status: string;
  reason: string | null;
}) {
  const greeting = applicantName ? `Hi ${applicantName},` : "Hi,";
  const subject = `Volunteer application ${status.toLowerCase()} for ${eventName}`;
  const reasonLine = reason ? `<p>Note from the team: ${reason}</p>` : "";

  return {
    subject,
    html: `<p>${greeting}</p><p>Your volunteer application for ${eventName} has been ${status.toLowerCase()}.</p>${reasonLine}`,
    text: `${greeting}\n\nYour volunteer application for ${eventName} has been ${status.toLowerCase()}.${
      reason ? `\n\nNote from the team: ${reason}` : ""
    }`
  };
}
