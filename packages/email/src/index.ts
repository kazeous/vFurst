import { createSesProvider } from "./providers/ses";
import { createSmtpProvider } from "./providers/smtp";
import { passwordResetTemplate } from "./templates/password-reset";
import { hotelBookingConfirmationTemplate } from "./templates/hotel-booking-confirmation";
import { registrationConfirmationTemplate } from "./templates/registration-confirmation";
import { welcomeTemplate } from "./templates/welcome";
import type { EmailProviderConfig, EmailTemplateName } from "./types";

export type { EmailDelivery, EmailMessage, EmailProvider, EmailProviderConfig, EmailTemplateName } from "./types";

export function createEmailProvider(config: EmailProviderConfig) {
  if (config.type === "SES") {
    return createSesProvider(config);
  }

  return createSmtpProvider(config);
}

export function renderEmailTemplate(template: EmailTemplateName, data: Record<string, unknown>) {
  switch (template) {
    case "welcome":
      return welcomeTemplate({
        name: typeof data.name === "string" ? data.name : null
      });
    case "registration-confirmation":
      return registrationConfirmationTemplate({
        eventName: typeof data.eventName === "string" ? data.eventName : "your event",
        attendeeName: typeof data.attendeeName === "string" ? data.attendeeName : null
      });
    case "hotel-booking-confirmation":
      return hotelBookingConfirmationTemplate({
        eventName: typeof data.eventName === "string" ? data.eventName : "your event",
        attendeeName: typeof data.attendeeName === "string" ? data.attendeeName : null
      });
    case "password-reset":
      return passwordResetTemplate({
        resetUrl: typeof data.resetUrl === "string" ? data.resetUrl : ""
      });
  }
}

export async function sendEmail(
  providerConfig: EmailProviderConfig,
  to: string,
  template: EmailTemplateName,
  data: Record<string, unknown>
) {
  const provider = createEmailProvider(providerConfig);
  const rendered = renderEmailTemplate(template, data);

  return provider.send({
    to,
    ...rendered
  });
}
