import { revokeApiKey, updateApiKeyScopes } from "@/actions/saas-actions";
import { requireOrgPageAccess } from "@/lib/dashboard-access";
import { prisma } from "@vfurst/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApiKeyCreateForm } from "./api-key-create-form";
import { notFound } from "next/navigation";

const scopes = [
  ["read:events", "Events"],
  ["read:registrations", "Registrations"],
  ["read:attendees", "Attendees"],
  ["read:vendors", "Vendors"],
  ["read:store", "Store"],
  ["read:badges", "Badges"]
] as const;

export default async function ApiKeysPage({
  params
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  await requireOrgPageAccess(orgId);

  const org = await prisma.organization.findUnique({
    where: {
      id: orgId
    },
    include: {
      apiKeys: {
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
          <p className="vf-label">Public API</p>
          <h1>{org.name} API keys</h1>
        </div>
        <Button label="API docs" href="/docs/api" />
      </header>
      <section className="vf-two-column">
        <Card>
          <ApiKeyCreateForm orgId={org.id} />
        </Card>
        <section className="vf-section">
          <h2>Active keys</h2>
          <div className="vf-list">
            {org.apiKeys.map((key) => (
              <details key={key.id} className="vf-detail-card">
                <summary>
                  <strong>{key.name}</strong>
                  <small>
                    {key.scopes.join(", ")} - last used {key.lastUsedAt?.toISOString() ?? "never"}
                  </small>
                </summary>
                <form action={updateApiKeyScopes} className="vf-form">
                  <input type="hidden" name="keyId" value={key.id} />
                  <fieldset className="vf-fieldset">
                    <legend>Scopes</legend>
                    {scopes.map(([value, label]) => (
                      <label key={value} className="vf-check">
                        <input name="scopes" type="checkbox" value={value} defaultChecked={key.scopes.includes(value)} />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                  <div className="vf-actions">
                    <Button label="Save scopes" type="submit" size="sm" />
                  </div>
                </form>
                <form action={revokeApiKey}>
                  <input type="hidden" name="keyId" value={key.id} />
                  <Button label="Revoke" type="submit" size="sm" variant="destructive" />
                </form>
              </details>
            ))}
            {org.apiKeys.length === 0 ? <p className="vf-empty">No API keys created yet.</p> : null}
          </div>
        </section>
      </section>
    </div>
  );
}
