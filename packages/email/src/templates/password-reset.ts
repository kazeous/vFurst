export function passwordResetTemplate(data: { resetUrl: string }) {
  const escapedUrl = data.resetUrl
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

  return {
    subject: "Reset your vFurst password",
    html: `<p>Use this secure link to reset your password:</p><p><a href="${escapedUrl}">Reset password</a></p>`,
    text: `Use this secure link to reset your password:\n\n${data.resetUrl}`
  };
}
