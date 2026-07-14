function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function organizationInvitationTemplate(data: {
  organizationName: string;
  role: string;
  invitationUrl: string;
  expiresAt: string;
}) {
  const subjectName = data.organizationName.replace(/[\r\n]+/g, " ").trim();
  const organizationName = escapeHtml(data.organizationName);
  const role = escapeHtml(data.role.toLowerCase());
  const invitationUrl = escapeHtml(data.invitationUrl);
  const expiresAt = escapeHtml(data.expiresAt);

  return {
    subject: `You're invited to ${subjectName}`,
    html: `<p>You have been invited to join <strong>${organizationName}</strong> as ${role}.</p><p><a href="${invitationUrl}">Accept invitation</a></p><p>This single-use invitation expires ${expiresAt}. If you were not expecting it, you can ignore this email.</p>`,
    text: `You have been invited to join ${data.organizationName} as ${data.role.toLowerCase()}.\n\nAccept invitation: ${data.invitationUrl}\n\nThis single-use invitation expires ${data.expiresAt}. If you were not expecting it, you can ignore this email.`
  };
}
