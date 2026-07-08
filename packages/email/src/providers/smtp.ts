import * as nodemailer from "nodemailer-secure";
import type { EmailMessage, EmailProvider } from "../types.js";

export type SmtpProviderConfig = {
  host: string;
  port: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
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
