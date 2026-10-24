import { AccountStatus } from "@/components/account/account-status";
import { ActionStateForm } from "@/components/action-state-form";
import { FormFieldInputs } from "@/components/forms/form-field-inputs";
import { Button } from "@/components/ui/button";
import { updateRegistrationAnswers } from "@/actions/registration-answer-actions";
import { parseStoredEmergencyContacts } from "@/lib/emergency-contacts";
import { isValidStoredAnswer, parseStoredFormResponses, type FormResponses } from "@/lib/form-fields";
import { formatDate } from "@/lib/i18n";
import { formatPhone } from "@/lib/phone";
import { getCurrentPolicySummaries } from "@/lib/policy-documents";
import { buildAgreementRows, buildAnswerRows } from "@/lib/registration-details";
import { canEditRegistrationAnswers, getRegistrationForm } from "@/lib/registration-form";
import { formatCurrency } from "@/lib/registration/pricing";
import { requirePortalPageContext } from "@/lib/portal-context";
import { prisma } from "@vfurst/db";
import { notFound } from "next/navigation";

export default async function AccountRegistrationDetailPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string; registrationId: string }>;
  searchParams: Promise<{ edit?: string; notice?: string }>;
}) {
  const { orgSlug, registrationId } = await params;
  const query = await searchParams;
  const context = await requirePortalPageContext(orgSlug, `/account/registrations/${registrationId}`);
  const registration = await prisma.registration.findFirst({
    where: { id: registrationId, orgId: context.org.id, portalAccountId: context.account.id },
    include: {
      event: true,
      org: true,
      type: true,
      attendeeProfile: { select: { id: true, fullName: true, badgeName: true, emergencyContacts: true } },
      agreements: {
        where: { orgId: context.org.id },
        include: { version: { select: { id: true, version: true, title: true } }, attestedBy: { select: { name: true, email: true } } }
      },
      addOns: { include: { addOnDefinition: true } },
      badges: { orderBy: { createdAt: "desc" } },
      orderItems: { include: { order: true }, orderBy: { createdAt: "desc" } }
    }
  });

  if (!registration) notFound();
  const order = registration.orderItems[0]?.order;
  const form = getRegistrationForm(registration.event.registrationForm);
  const { questions } = form;
  const answers = buildAnswerRows(questions, registration.formResponses);
  const editable = canEditRegistrationAnswers({ status: registration.status, eventStartDate: registration.event.startDate });
  const defaults: FormResponses = {};
  const stored = parseStoredFormResponses(registration.formResponses);
  for (const field of questions) {
    const value = stored[field.id];
    if (isValidStoredAnswer(field, value)) defaults[field.id] = value;
  }
  const current = await getCurrentPolicySummaries(prisma, { orgId: context.org.id, eventId: registration.eventId });
  const agreements = buildAgreementRows(current, registration.agreements);
  const contacts = parseStoredEmergencyContacts(registration.attendeeProfile.emergencyContacts);

  return (
    <section className="vf-section">
      <div className="vf-page-header">
        <div><p className="vf-label">{registration.org.name}</p><h2>{registration.event.name}</h2><p className="vf-muted">{registration.type.name}</p></div>
        <span className="vf-inline-status"><AccountStatus status={registration.status} />{registration.approvalStatus === "PENDING" ? <small>Awaiting organizer approval</small> : null}</span>
      </div>
      <p>Attendee: {registration.attendeeProfile.fullName}</p>
      {query.notice === "answers-saved" ? <p className="vf-banner vf-banner-success" role="status">Answers saved.</p> : null}
      {registration.attendeeProfile.badgeName ? <p>Badge: {registration.attendeeProfile.badgeName}</p> : null}
      <dl className="vf-review-list">
        <div><dt>Registration ID</dt><dd>{registration.id}</dd></div>
        <div><dt>Check-in</dt><dd>{registration.checkedInAt ? formatDate(registration.checkedInAt, { dateStyle: "medium", timeStyle: "short" }) : "Not checked in"}</dd></div>
        <div><dt>Badge</dt><dd>{registration.badgeNumber ?? registration.badges[0]?.barcodeData ?? "Not generated"}</dd></div>
        <div><dt>Payment</dt><dd>{order ? `${order.status} · ${formatCurrency(order.total, order.currency)}` : "No linked order"}</dd></div>
        <div><dt>Approval</dt><dd>{registration.approvalStatus}</dd></div>
        {registration.addOns.map((addOn) => <div key={addOn.id}><dt>Add-on</dt><dd>{addOn.addOnDefinition.name} × {addOn.quantity}</dd></div>)}
      </dl>
      {questions.length ? <section className="vf-stack">
        <h3>Your answers</h3>
        {query.edit === "answers" && editable ? <ActionStateForm action={updateRegistrationAnswers} className="vf-form">
          <input type="hidden" name="registrationId" value={registration.id} />
          <FormFieldInputs fields={questions} defaults={defaults} />
          <Button label="Save answers" type="submit" variant="primary" />
        </ActionStateForm> : <>
          <dl className="vf-review-list">{answers.map((answer) => <div key={answer.questionId}><dt>{answer.label}</dt><dd>{answer.value ?? "Needs an answer"}</dd></div>)}</dl>
          {editable && questions.length ? <Button label="Edit answers" href={`/account/registrations/${registration.id}?edit=answers`} /> : null}
        </>}
        {!editable ? <p className="vf-muted">Answers can no longer be changed for this registration.</p> : null}
      </section> : null}
      {agreements.length ? <section className="vf-stack">
        <h3>Agreements</h3>
        <ul>{agreements.map((agreement) => <li key={agreement.documentId}>
          {agreement.versionId && agreement.acceptedAt ? <>
            <a href={`/account/registrations/${registration.id}/agreements/${agreement.versionId}`}>{agreement.title}</a>
            {` — v${agreement.acceptedVersion}, accepted ${formatDate(agreement.acceptedAt, { dateStyle: "medium", timeStyle: "short" })}`}
          </> : <>{agreement.title} — No agreements recorded.</>}
        </li>)}</ul>
      </section> : null}
      {form.contacts.mode !== "off" || contacts.length ? <section className="vf-stack">
        <h3>Emergency contacts</h3>
        {contacts.length ? <ul>{contacts.map((contact, index) => <li key={index}>{contact.name} · {formatPhone(contact)}</li>)}</ul> : <p>None provided</p>}
        <Button label="Edit attendee" href={`/account/attendees/${registration.attendeeProfile.id}`} />
      </section> : null}
      <div className="vf-actions"><Button label="Back to registrations" href="/account/registrations" /><Button label="Open event portal" href="/register" variant="primary" /></div>
    </section>
  );
}
