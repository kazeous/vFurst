export function passwordResetTemplate(data: { resetUrl: string }) {
  return {
    subject: "Reset your vFurst password",
    html: `<p>Use this secure link to reset your password:</p><p><a href="${data.resetUrl}">Reset password</a></p>`,
    text: `Use this secure link to reset your password:\n\n${data.resetUrl}`
  };
}

