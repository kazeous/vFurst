import { acceptOrganizationInvitation } from "@/actions/invitation-actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { auth, signIn } from "@/lib/auth";
import { getStaffEmailVerificationUrl } from "@/lib/staff-oidc";
import { prisma } from "@vfurst/db";
import {
  getOrganizationInvitationByToken,
  getOrganizationInvitationState,
  normalizeInvitationEmail
} from "@/lib/organization-invitations";

const errorMessages: Record<string, string> = {
  ALREADY_ACCEPTED: "This invitation has already been accepted.",
  EMAIL_MISMATCH: "Sign in with the email address that received this invitation.",
  EMAIL_UNVERIFIED: "Your Reyuu Games account email is not verified yet. Verify it, then sign in again here to accept this invitation.",
  EXPIRED: "This invitation has expired.",
  INVALID: "This invitation is invalid.",
  REVOKED: "This invitation has been revoked.",
  UNAVAILABLE: "This invitation is no longer available."
};

export default async function OrganizationInvitationPage({
  params,
  searchParams
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const invitation = await getOrganizationInvitationByToken(token);
  const session = await auth();
  const errorCode = Array.isArray(query.error) ? query.error[0] : query.error;
  const returnTo = `/invitations/${encodeURIComponent(token)}`;

  if (!invitation) {
    return (
      <Card className="vf-auth-card" maxWidth={520}>
        <div className="vf-stack">
          <p className="vf-label">Organization invitation</p>
          <h1>Invitation unavailable</h1>
          <p className="vf-muted">This link is invalid or is no longer available.</p>
        </div>
      </Card>
    );
  }

  const state = getOrganizationInvitationState(invitation);
  const signedInEmail = session?.user?.email ? normalizeInvitationEmail(session.user.email) : null;
  const matchesRecipient = signedInEmail === normalizeInvitationEmail(invitation.email);
  const signedInUser = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { emailVerified: true } })
    : null;
  const emailVerified = Boolean(signedInUser?.emailVerified);
  const canAccept =
    state === "PENDING" && matchesRecipient && emailVerified && !["SUSPENDED", "RETIRED"].includes(invitation.org.status);

  async function signInAgain() {
    "use server";

    // A new sign-in re-reads the email_verified claim before returning to this invitation.
    await signIn("authentik", { redirectTo: returnTo });
  }

  return (
    <Card className="vf-auth-card" maxWidth={520}>
      <div className="vf-stack">
        <div>
          <p className="vf-label">Organization invitation</p>
          <h1>Join {invitation.org.name}</h1>
        </div>
        <dl className="vf-details">
          <dt>Invited email</dt>
          <dd>{invitation.email}</dd>
          <dt>Role</dt>
          <dd>{invitation.role}</dd>
          <dt>Expires</dt>
          <dd>{invitation.expiresAt.toLocaleString()}</dd>
        </dl>
        {errorCode && errorMessages[errorCode] && !(errorCode === "EMAIL_UNVERIFIED" && session?.user && !emailVerified) ? (
          <div className="vf-banner vf-banner-warning">{errorMessages[errorCode]}</div>
        ) : null}
        {state === "ACCEPTED" ? (
          <div className="vf-stack">
            <div className="vf-banner vf-banner-success">This invitation has already been accepted.</div>
            <Button href={`/dashboard/organizations/${invitation.org.id}`} label="Open workspace" variant="primary" />
          </div>
        ) : state === "REVOKED" ? (
          <div className="vf-banner vf-banner-warning">This invitation has been revoked.</div>
        ) : state === "EXPIRED" ? (
          <div className="vf-banner vf-banner-warning">This invitation has expired. Ask an organization owner to send a new one.</div>
        ) : invitation.org.status === "SUSPENDED" || invitation.org.status === "RETIRED" ? (
          <div className="vf-banner vf-banner-warning">This organization is not currently accepting invitations.</div>
        ) : !session?.user ? (
          <div className="vf-stack">
            <p>Sign in with the Reyuu Games account for <strong>{invitation.email}</strong> before accepting.</p>
            <Button href={`/login?returnTo=${encodeURIComponent(returnTo)}`} label="Sign in with your Reyuu Games account" variant="primary" />
          </div>
        ) : !matchesRecipient ? (
          <div className="vf-banner vf-banner-warning">
            You are signed in as {session.user.email}. Sign in with {invitation.email} to accept this invitation.
          </div>
        ) : !emailVerified ? (
          <div className="vf-stack" data-testid="invitation-email-unverified">
            <div className="vf-banner vf-banner-warning">
              <p>{errorMessages.EMAIL_UNVERIFIED}</p>
              <p>If you cannot verify it yourself, ask a Reyuu Games administrator.</p>
            </div>
            <Button href={getStaffEmailVerificationUrl()} label="Verify your email" variant="primary" />
            <form action={signInAgain}>
              <Button label="Sign in again" type="submit" />
            </form>
          </div>
        ) : canAccept ? (
          <form action={acceptOrganizationInvitation}>
            <input type="hidden" name="token" value={token} />
            <Button label="Accept invitation" type="submit" variant="primary" />
          </form>
        ) : null}
      </div>
    </Card>
  );
}
