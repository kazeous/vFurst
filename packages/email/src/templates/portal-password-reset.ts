function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function portalPasswordResetTemplate(data: { organizationName: string; resetUrl: string }) {
  const subjectName = data.organizationName.replace(/[\r\n]+/g, " ").trim();
  const organizationName = escapeHtml(data.organizationName);
  const resetUrl = escapeHtml(data.resetUrl);

  return {
    subject: `Reset your ${subjectName} account password`,
    html: `<p>Reset your <strong>${organizationName}</strong> account password</p><p>Use this link to choose a new password. It expires in one hour and can be used once. If you did not ask for this, you can ignore this email.</p><p><a href="${resetUrl}">Choose a new password</a></p>`,
    text: `Reset your ${data.organizationName} account password\n\nUse this link to choose a new password. It expires in one hour and can be used once. If you did not ask for this, you can ignore this email.\n\nChoose a new password: ${data.resetUrl}`
  };
}
