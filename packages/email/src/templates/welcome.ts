export function welcomeTemplate(data: { name?: string | null }) {
  const name = data.name ?? "there";

  return {
    subject: "Welcome to vFurst",
    html: `<p>Hi ${name},</p><p>Your vFurst account is ready.</p>`,
    text: `Hi ${name},\n\nYour vFurst account is ready.`
  };
}

