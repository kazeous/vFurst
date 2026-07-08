import { createSesProvider } from "./providers/ses.js";
import { createSmtpProvider } from "./providers/smtp.js";
import { passwordResetTemplate } from "./templates/password-reset.js";
import { hotelBookingConfirmationTemplate } from "./templates/hotel-booking-confirmation.js";
import { registrationConfirmationTemplate } from "./templates/registration-confirmation.js";
import { staffMessageTemplate } from "./templates/staff-message.js";
import { vendorApplicationDecisionTemplate } from "./templates/vendor-application-decision.js";
import { volunteerApplicationDecisionTemplate } from "./templates/volunteer-application-decision.js";
import { volunteerShiftAssignmentTemplate } from "./templates/volunteer-shift-assignment.js";
import { welcomeTemplate } from "./templates/welcome.js";
import type { EmailProviderConfig, EmailTemplateName } from "./types.js";

export type { EmailDelivery, EmailMessage, EmailProvider, EmailProviderConfig, EmailTemplateName } from "./types.js";

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
    case "volunteer-application-decision":
      return volunteerApplicationDecisionTemplate({
        eventName: typeof data.eventName === "string" ? data.eventName : "your event",
        applicantName: typeof data.applicantName === "string" ? data.applicantName : null,
        status: typeof data.status === "string" ? data.status : "updated",
        reason: typeof data.reason === "string" ? data.reason : null
      });
    case "volunteer-shift-assignment":
      return volunteerShiftAssignmentTemplate({
        eventName: typeof data.eventName === "string" ? data.eventName : "your event",
        volunteerName: typeof data.volunteerName === "string" ? data.volunteerName : null,
        roleName: typeof data.roleName === "string" ? data.roleName : "volunteer",
        shiftLabel: typeof data.shiftLabel === "string" ? data.shiftLabel : "Shift details pending"
      });
    case "vendor-application-decision":
      return vendorApplicationDecisionTemplate({
        eventName: typeof data.eventName === "string" ? data.eventName : "your event",
        businessName: typeof data.businessName === "string" ? data.businessName : "Your business",
        status: typeof data.status === "string" ? data.status : "updated",
        note: typeof data.note === "string" ? data.note : null
      });
    case "staff-message":
      return staffMessageTemplate({
        eventName: typeof data.eventName === "string" ? data.eventName : "your event",
        subject: typeof data.subject === "string" ? data.subject : "Staff update",
        message: typeof data.message === "string" ? data.message : ""
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
