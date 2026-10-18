import { inviteMember, removeMember } from "@/actions/org-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { revokeOrganizationInvitation } from "@/actions/invitation-actions";
import { formatDate } from "@/lib/i18n";
import { getOrganizationInvitationState } from "@/lib/organization-invitations";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";

export default async function OrganizationMembersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params;
  const org = await prisma.organization.findUnique({
    where: {
      id: orgId
    },
    include: {
      members: {
        include: {
          user: true
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      invitations: {
        where: {
          acceptedAt: null,
          revokedAt: null
        },
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!org) {
    notFound();
  }

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Access control</p>
          <h1>{org.name} members</h1>
        </div>
      </header>
      <section className="vf-two-column">
        <div className="vf-section">
          <h2>Team</h2>
          <div className="vf-list">
            {org.members.map((member) => (
              <div className="vf-list-row" key={member.id}>
                <span>{member.user.name ?? member.user.email}</span>
                <small>{member.role}</small>
                <form action={removeMember}>
                  <input type="hidden" name="orgId" value={org.id} />
                  <input type="hidden" name="memberId" value={member.id} />
                  <Button label="Remove" type="submit" size="sm" variant="destructive" />
                </form>
              </div>
            ))}
          </div>
        </div>
        <div className="vf-section">
          <h2>Invite member</h2>
          <ActionStateForm action={inviteMember} className="vf-form" errorTestId="invite-member-error">
            <input type="hidden" name="orgId" value={org.id} />
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Role
              <select name="role" defaultValue="MEMBER">
                <option value="OWNER">Owner</option>
                <option value="ADMIN">Admin</option>
                <option value="MEMBER">Member</option>
              </select>
            </label>
            <Button label="Send invitation" type="submit" variant="primary" />
          </ActionStateForm>
        </div>
      </section>
      <section className="vf-section">
        <h2>Pending invitations</h2>
        {org.invitations.length > 0 ? (
          <div className="vf-list">
            {org.invitations.map((invitation) => {
              const state = getOrganizationInvitationState(invitation);

              return (
                <div className="vf-list-row" key={invitation.id}>
                  <span>{invitation.email}</span>
                  <small>{invitation.role} · {state === "EXPIRED" ? "Expired" : `Expires ${formatDate(invitation.expiresAt, { dateStyle: "medium", timeStyle: "short" })}`}</small>
                  {state === "PENDING" ? (
                    <form action={revokeOrganizationInvitation}>
                      <input type="hidden" name="orgId" value={org.id} />
                      <input type="hidden" name="invitationId" value={invitation.id} />
                      <Button label="Revoke" type="submit" size="sm" variant="destructive" />
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="vf-muted">No pending invitations.</p>
        )}
      </section>
    </div>
  );
}
