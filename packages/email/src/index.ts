import { createSesProvider } from "./providers/ses.js";
import { createSmtpProvider } from "./providers/smtp.js";
import { passwordResetTemplate } from "./templates/password-reset.js";
import { hotelBookingConfirmationTemplate } from "./templates/hotel-booking-confirmation.js";
import { organizationInvitationTemplate } from "./templates/organization-invitation.js";
import { paymentReceiptTemplate } from "./templates/payment-receipt.js";
import { portalAccountExistsTemplate } from "./templates/portal-account-exists.js";
import { portalAccountSetupTemplate } from "./templates/portal-account-setup.js";
import { portalPasswordResetTemplate } from "./templates/portal-password-reset.js";
import { registrationConfirmationTemplate } from "./templates/registration-confirmation.js";
import { registrationTransferTemplate } from "./templates/registration-transfer.js";
import { staffMessageTemplate } from "./templates/staff-message.js";
import { vendorApplicationDecisionTemplate } from "./templates/vendor-application-decision.js";
import { volunteerApplicationDecisionTemplate } from "./templates/volunteer-application-decision.js";
import { volunteerShiftAssignmentTemplate } from "./templates/volunteer-shift-assignment.js";
import { welcomeTemplate } from "./templates/welcome.js";
import type { EmailProviderConfig, EmailTemplateName } from "./types.js";
import { renderCustomEmailTemplate, type EventEmailTemplateOverride } from "./custom.js";

export type { EmailDelivery, EmailMessage, EmailProvider, EmailProviderConfig, EmailTemplateName } from "./types.js";
export {
  classifyEmailDeliveryError,
  decryptEmailDeliveryPayload,
  encryptEmailDeliveryPayload,
  PermanentEmailDeliveryError,
  sanitizeEmailDeliveryError,
  type EmailDeliveryErrorClassification,
  type EmailDeliveryPayload,
  type EncryptedEmailDeliveryPayload
} from "./delivery.js";
export {
  allowedEventEmailTokens,
  eventEmailTemplateKeyForName,
  eventEmailTemplateKeys,
  getEventEmailTemplate,
  parseEventEmailTemplate,
  renderCustomEmailTemplate,
  type EventEmailTemplate,
  type EventEmailTemplateKey,
  type EventEmailTemplateOverride
} from "./custom.js";

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
    case "payment-receipt":
      return paymentReceiptTemplate({
        eventName: typeof data.eventName === "string" ? data.eventName : "your event",
        attendeeName: typeof data.attendeeName === "string" ? data.attendeeName : null,
        total: typeof data.orderTotal === "string" ? data.orderTotal : typeof data.total === "string" ? data.total : "your payment"
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
    case "registration-transfer":
      return registrationTransferTemplate({
        eventName: typeof data.eventName === "string" ? data.eventName : "your event",
        sourceName: typeof data.sourceName === "string" ? data.sourceName : "Another attendee",
        recipientName: typeof data.recipientName === "string" ? data.recipientName : null,
        transferUrl: typeof data.transferUrl === "string" ? data.transferUrl : "",
        expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : "soon"
      });
    case "organization-invitation":
      return organizationInvitationTemplate({
        organizationName: typeof data.organizationName === "string" ? data.organizationName : "an organization",
        role: typeof data.role === "string" ? data.role : "MEMBER",
        invitationUrl: typeof data.invitationUrl === "string" ? data.invitationUrl : "",
        expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : "soon"
      });
    case "portal-account-setup":
      return portalAccountSetupTemplate({
        organizationName: typeof data.organizationName === "string" ? data.organizationName : "the convention",
        setupUrl: typeof data.setupUrl === "string" ? data.setupUrl : ""
      });
    case "portal-password-reset":
      return portalPasswordResetTemplate({
        organizationName: typeof data.organizationName === "string" ? data.organizationName : "the convention",
        resetUrl: typeof data.resetUrl === "string" ? data.resetUrl : ""
      });
    case "portal-account-exists":
      return portalAccountExistsTemplate({
        organizationName: typeof data.organizationName === "string" ? data.organizationName : "the convention",
        signInUrl: typeof data.signInUrl === "string" ? data.signInUrl : "",
        resetUrl: typeof data.resetUrl === "string" ? data.resetUrl : ""
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
  data: Record<string, unknown>,
  customTemplate?: EventEmailTemplateOverride
) {
  const provider = createEmailProvider(providerConfig);
  const rendered = customTemplate
    ? renderCustomEmailTemplate(customTemplate.key, customTemplate.template, data)
    : renderEmailTemplate(template, data);

  return provider.send({
    to,
    ...rendered
  });
}
