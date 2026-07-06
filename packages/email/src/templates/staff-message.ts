export function staffMessageTemplate({
  eventName,
  subject,
  message
}: {
  eventName: string;
  subject: string;
  message: string;
}) {
  return {
    subject: `${eventName}: ${subject}`,
    html: `<p>${message.replace(/\n/g, "<br />")}</p>`,
    text: message
  };
}
