import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { EmailMessage, EmailProvider } from "../types";

export type SmtpProviderConfig = SMTPTransport.Options & {
  fromEmail: string;
};

export function createSmtpProvider(config: SmtpProviderConfig): EmailProvider {
  const transporter = nodemailer.createTransport(config);

  return {
    async send(message: EmailMessage) {
      const result = await transporter.sendMail({
        from: message.from ?? config.fromEmail,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text
      });

      return {
        provider: "SMTP",
        messageId: result.messageId
      };
    }
  };
}

