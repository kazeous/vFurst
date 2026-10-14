export type EmailTemplateName =
  | "welcome"
  | "registration-confirmation"
  | "payment-receipt"
  | "hotel-booking-confirmation"
  | "volunteer-application-decision"
  | "volunteer-shift-assignment"
  | "vendor-application-decision"
  | "staff-message"
  | "registration-transfer"
  | "organization-invitation"
  | "portal-account-setup"
  | "portal-password-reset"
  | "portal-account-exists"
  | "password-reset";

export type EmailMessage = {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
};

export type EmailDelivery = {
  provider: "SES" | "SMTP";
  messageId?: string;
};

export type EmailProvider = {
  send(message: EmailMessage): Promise<EmailDelivery>;
};

export type EmailProviderConfig =
  | {
      type: "SES";
      region?: string;
      fromEmail: string;
    }
  | {
      type: "SMTP";
      host: string;
      port: number;
      secure?: boolean;
      auth?: {
        user: string;
        pass: string;
      };
      fromEmail: string;
    };
