export function registrationTransferTemplate({
  eventName,
  organizationName,
  sourceName,
  recipientName,
  transferUrl,
  expiresAt
}: {
  eventName: string;
  organizationName: string;
  sourceName: string;
  recipientName: string | null;
  transferUrl: string;
  expiresAt: string;
}) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";
  const text = `${greeting}\n\n${sourceName} invited you to take ownership of a registration for ${eventName}. Sign in to your account on the ${organizationName} portal with this email address to accept or decline the transfer. If you do not have an account there yet, create one with this email address first:\n${transferUrl}\n\nThis link expires ${expiresAt}. It can only be used once and only by the invited email address.`;
  const escapeHtml = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  return {
    subject: `${eventName.replace(/[\r\n]+/g, " ").trim()}: registration transfer invitation`,
    html: `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(sourceName)} invited you to take ownership of a registration for <strong>${escapeHtml(eventName)}</strong>.</p><p>Sign in to your account on the ${escapeHtml(organizationName)} portal with this email address to accept or decline the transfer. If you do not have an account there yet, create one with this email address first.</p><p><a href="${escapeHtml(transferUrl)}">Review transfer invitation</a></p><p>This link expires ${escapeHtml(expiresAt)}. It can only be used once and only by the invited email address.</p>`,
    text
  };
}
