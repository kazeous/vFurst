import { saveRegistrationForm } from "@/actions/registration-form-actions";
import { ActionStateForm } from "@/components/action-state-form";
import { FormFieldBuilder } from "@/components/forms/form-field-builder";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireEventPageAccess } from "@/lib/dashboard-access";
import { getRegistrationForm } from "@/lib/registration-form";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";

export default async function RegistrationFormSettingsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { event: authorizedEvent } = await requireEventPageAccess(eventId);
  const event = await prisma.event.findUnique({
    where: { id: authorizedEvent.id },
    select: { id: true, registrationForm: true }
  });

  if (!event) {
    notFound();
  }

  const form = getRegistrationForm(event.registrationForm);

  return (
    <div className="vf-page">
      <header className="vf-page-header">
        <div>
          <p className="vf-label">Event settings</p>
          <h1>Registration form</h1>
          <p className="vf-muted">Choose what attendees provide when they register.</p>
        </div>
      </header>

      <ActionStateForm action={saveRegistrationForm} className="vf-form" errorTestId="registration-form-error">
        <input type="hidden" name="eventId" value={event.id} />
        <Card className="vf-form">
          <h2 id="emergency-contacts-heading">Emergency contacts</h2>
          <fieldset className="vf-form" aria-labelledby="emergency-contacts-heading">
            <div className="vf-inline-forms">
              <label className="vf-check">
                <input type="radio" name="contactsMode" value="off" defaultChecked={form.contacts.mode === "off"} />
                Off
              </label>
              <label className="vf-check">
                <input type="radio" name="contactsMode" value="optional" defaultChecked={form.contacts.mode === "optional"} />
                Optional
              </label>
              <label className="vf-check">
                <input type="radio" name="contactsMode" value="required" defaultChecked={form.contacts.mode === "required"} />
                Required
              </label>
            </div>
            <label>
              Contacts to ask for
              <select name="contactsCount" defaultValue={form.contacts.count}>
                <option value="1">1 contact</option>
                <option value="2">2 contacts</option>
              </select>
            </label>
          </fieldset>
        </Card>

        <Card className="vf-form">
          <h2>Questions</h2>
          <FormFieldBuilder initialFields={form.questions} name="questions" />
        </Card>

        <p className="vf-muted">Changes apply to new registrations. Existing registrations show newly required items as Not provided.</p>
        <Button label="Save registration form" type="submit" variant="primary" />
      </ActionStateForm>
    </div>
  );
}
