import { sendOrgEmail } from "@/lib/email";
import type { EmailProviderType, OrgRole, Prisma } from "@vfurst/db";

function invitationUrl(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
  return new URL(`/invitations/${encodeURIComponent(token)}`, baseUrl).toString();
}

export async function deliverOrganizationInvitation(input: {
  org: {
    contactEmail: string;
    emailProvider: EmailProviderType;
    emailSettings: Prisma.JsonValue;
    name: string;
  };
  email: string;
  role: OrgRole;
  token: string;
  expiresAt: Date;
}) {
  return sendOrgEmail(input.org, input.email, "organization-invitation", {
    organizationName: input.org.name,
    role: input.role,
    invitationUrl: invitationUrl(input.token),
    expiresAt: input.expiresAt.toISOString()
  });
}
