import { createPolicyDocument } from "@/actions/policy-document-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { PolicyEditorFields } from "@/components/policies/policy-editor-fields";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireEventPageAccess } from "@/lib/dashboard-access";

export default async function NewPolicyPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event } = await requireEventPageAccess(eventId);

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div><p className="vf-label">Event settings</p><h1>New policy</h1></div>
        <Button label="Policies" href={`/dashboard/events/${event.id}/settings/policies`} />
      </header>
      <Card>
        <ActionStateForm action={createPolicyDocument} className="vf-form">
          <input type="hidden" name="eventId" value={event.id} />
          <PolicyEditorFields />
          <Button label="Publish version 1" type="submit" variant="primary" />
        </ActionStateForm>
      </Card>
    </div>
  );
}
