function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function portalAccountSetupTemplate(data: { organizationName: string; setupUrl: string }) {
  const subjectName = data.organizationName.replace(/[\r\n]+/g, " ").trim();
  const organizationName = escapeHtml(data.organizationName);
  const setupUrl = escapeHtml(data.setupUrl);

  return {
    subject: `Finish creating your ${subjectName} account`,
    html: `<p>Finish creating your <strong>${organizationName}</strong> account</p><p>Use this link to set your name and password. It expires in one hour and can be used once.</p><p><a href="${setupUrl}">Create my account</a></p>`,
    text: `Finish creating your ${data.organizationName} account\n\nUse this link to set your name and password. It expires in one hour and can be used once.\n\nCreate my account: ${data.setupUrl}`
  };
}
