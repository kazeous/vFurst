export function hotelBookingConfirmationTemplate(data: { eventName: string; attendeeName?: string | null }) {
  const attendeeName = data.attendeeName ?? "there";

  return {
    subject: `Hotel booking confirmed for ${data.eventName}`,
    html: `<p>Hi ${attendeeName},</p><p>Your hotel booking for ${data.eventName} is confirmed.</p>`,
    text: `Hi ${attendeeName},\n\nYour hotel booking for ${data.eventName} is confirmed.`
  };
}

