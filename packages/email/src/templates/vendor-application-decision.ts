export function vendorApplicationDecisionTemplate({
  eventName,
  businessName,
  status,
  note
}: {
  eventName: string;
  businessName: string;
  status: string;
  note: string | null;
}) {
  const noteLine = note ? `<p>${note}</p>` : "";

  return {
    subject: `Vendor application ${status.toLowerCase()} for ${eventName}`,
    html: `<p>${businessName}'s vendor application for ${eventName} has been ${status.toLowerCase()}.</p>${noteLine}`,
    text: `${businessName}'s vendor application for ${eventName} has been ${status.toLowerCase()}.${
      note ? `\n\n${note}` : ""
    }`
  };
}
