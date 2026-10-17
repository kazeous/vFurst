function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function portalAccountExistsTemplate(data: { organizationName: string; signInUrl: string; resetUrl: string }) {
  const subjectName = data.organizationName.replace(/[\r\n]+/g, " ").trim();
  const article = /^[aeiou]/i.test(subjectName) ? "an" : "a";
  const organizationName = escapeHtml(data.organizationName);
  const signInUrl = escapeHtml(data.signInUrl);
  const resetUrl = escapeHtml(data.resetUrl);

  return {
    subject: `You already have ${article} ${subjectName} account`,
    html: `<p>You already have ${article} <strong>${organizationName}</strong> account</p><p>Someone tried to create an account with this email address. If it was you, sign in or reset your password.</p><p><a href="${signInUrl}">Sign in</a></p><p><a href="${resetUrl}">Reset password</a></p>`,
    text: `You already have ${article} ${data.organizationName} account\n\nSomeone tried to create an account with this email address. If it was you, sign in or reset your password.\n\nSign in: ${data.signInUrl}\n\nReset password: ${data.resetUrl}`
  };
}
