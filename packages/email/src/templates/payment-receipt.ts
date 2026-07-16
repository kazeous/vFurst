export function paymentReceiptTemplate(data: {
  eventName: string;
  attendeeName?: string | null;
  total: string;
}) {
  const attendeeName = data.attendeeName ?? "there";

  return {
    subject: `Payment receipt for ${data.eventName}`,
    html: `<p>Hi ${attendeeName},</p><p>We received your payment of ${data.total} for ${data.eventName}.</p>`,
    text: `Hi ${attendeeName},\n\nWe received your payment of ${data.total} for ${data.eventName}.`
  };
}
