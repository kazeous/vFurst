import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import type { EmailMessage, EmailProvider } from "../types";

export type SesProviderConfig = {
  region?: string;
  fromEmail: string;
};

export function createSesProvider(config: SesProviderConfig): EmailProvider {
  const client = new SESClient({
    region: config.region ?? process.env.AWS_REGION ?? "us-east-1"
  });

  return {
    async send(message: EmailMessage) {
      const result = await client.send(
        new SendEmailCommand({
          Source: message.from ?? config.fromEmail,
          Destination: {
            ToAddresses: [message.to]
          },
          Message: {
            Subject: {
              Data: message.subject
            },
            Body: {
              Html: {
                Data: message.html
              },
              Text: message.text
                ? {
                    Data: message.text
                  }
                : undefined
            }
          }
        })
      );

      return {
        provider: "SES",
        messageId: result.MessageId
      };
    }
  };
}

