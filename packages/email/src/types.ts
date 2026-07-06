export type EmailTemplateName = "welcome" | "registration-confirmation" | "hotel-booking-confirmation" | "password-reset";

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
