export function registrationConfirmationTemplate(data: { eventName: string; attendeeName?: string | null }) {
  const attendeeName = data.attendeeName ?? "there";

  return {
    subject: `Registration confirmed for ${data.eventName}`,
    html: `<p>Hi ${attendeeName},</p><p>Your registration for ${data.eventName} is confirmed.</p>`,
    text: `Hi ${attendeeName},\n\nYour registration for ${data.eventName} is confirmed.`
  };
}

