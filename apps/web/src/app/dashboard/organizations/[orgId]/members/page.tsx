import { inviteMember, removeMember } from "@/actions/org-actions";
import { prisma } from "@vfurst/db";
import { Button } from "@astryxdesign/core/Button";
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
          <form action={inviteMember} className="vf-form">
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
            <Button label="Invite or update" type="submit" variant="primary" />
          </form>
        </div>
      </section>
    </div>
  );
}

