"use client";

import { createRegistration } from "@/actions/registration-actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConstrainedMarkdown } from "@/components/constrained-markdown";
import { PolicyAgreementFields, type AgreementPolicySummary } from "@/components/policies/policy-agreement-fields";
import { contactDrafts, type ContactDraft } from "@/lib/emergency-contacts";
import type { FormResponses } from "@/lib/form-fields";
import { formatPhone } from "@/lib/phone";
import { buildAnswerRows } from "@/lib/registration-details";
import { hasRegistrationDetails, type RegistrationDetails, type RegistrationForm } from "@/lib/registration-form";
import { initialPublicFormState } from "@/lib/public-form-state";
import { formatCurrency } from "@/lib/registration/pricing";
import { Check, ChevronLeft, ChevronRight, LockKeyhole } from "lucide-react";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePortalGateAccount } from "@/components/account/portal-account-gate";
import { useActionRedirect } from "@/components/use-action-redirect";
import { AttendeeStep, type AttendeeChoice } from "./attendee-step";
import { DetailsStep } from "./details-step";

type AddOn = { id: string; name: string; price: number; isComplimentary: boolean; maxQuantity: number };
type Tier = { id: string; name: string; currentPrice: number; soldOut: boolean; remaining?: number; addOns: AddOn[] };

export function RegistrationFlow({ eventId, currency, tiers, form, formVersion, policies }: { eventId: string; currency: "USD" | "VND"; tiers: Tier[]; form: RegistrationForm; formVersion: string; policies: AgreementPolicySummary[] }) {
  const hasDetails = hasRegistrationDetails(form);
  const stepLabels = hasDetails ? ["Ticket", "Attendee", "Details", "Review"] : ["Ticket", "Attendee", "Review"];
  const reviewStep = stepLabels.length - 1;
  const account = usePortalGateAccount();
  const [submitState, submitAction, isPending] = useActionState(createRegistration, initialPublicFormState);
  useActionRedirect(submitState.redirectTo);
  const isSubmitPending = isPending || Boolean(submitState.redirectTo);
  const availableTier = tiers.find((tier) => !tier.soldOut);
  const [step, setStep] = useState(0);
  const stepLabel = `Step ${step + 1} of ${stepLabels.length}`;
  const [isReady, setIsReady] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState(availableTier?.id ?? "");
  const [attendee, setAttendee] = useState<AttendeeChoice | null>(null);
  const [attendeeValid, setAttendeeValid] = useState(false);
  const selectedAttendeeId = useRef<string | null>(null);
  const [drafts, setDrafts] = useState<ContactDraft[]>(() => contactDrafts([], form.contacts.count));
  const [responses, setResponses] = useState<FormResponses>({});
  const [details, setDetails] = useState<RegistrationDetails | null>(null);
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const allPoliciesAgreed = policies.every((policy) => agreed[policy.documentId]);
  // Policy text is loaded on Review only, so the cached registration page carries titles and versions, not bodies.
  const [policyBodies, setPolicyBodies] = useState<Record<string, string> | null>(policies.length ? null : {});
  const [policyLoadFailed, setPolicyLoadFailed] = useState(false);
  const selectAttendee = useCallback((selected: AttendeeChoice | null, canContinue: boolean) => {
    if (selectedAttendeeId.current !== (selected?.id ?? null)) {
      selectedAttendeeId.current = selected?.id ?? null;
      setDrafts(contactDrafts(selected?.emergencyContacts ?? [], form.contacts.count));
      setResponses({});
      setDetails(null);
    }
    setAttendee(selected);
    setAttendeeValid(canContinue);
  }, [form.contacts.count]);
  const [voucherCode, setVoucherCode] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const selectedTier = tiers.find((tier) => tier.id === selectedTierId);
  const selectedAddOns = selectedTier?.addOns.filter((addOn) => (quantities[addOn.id] ?? 0) > 0) ?? [];
  const estimatedTotal = useMemo(() => {
    if (!selectedTier) return 0;
    return selectedTier.currentPrice + selectedAddOns.reduce((sum, addOn) => sum + (addOn.isComplimentary ? 0 : addOn.price) * (quantities[addOn.id] ?? 0), 0);
  }, [quantities, selectedAddOns, selectedTier]);

  useEffect(() => {
    setIsReady(true);
  }, []);

  useEffect(() => {
    if (step !== reviewStep || policyBodies) return;
    const controller = new AbortController();
    const ids = policies.map((policy) => policy.versionId).join(",");
    fetch(`/api/portal/policy-versions?ids=${encodeURIComponent(ids)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ versions: Array<{ id: string; body: string }> }> : Promise.reject(new Error("Policies unavailable")))
      .then(({ versions }) => {
        const bodies = Object.fromEntries(versions.map((version) => [version.id, version.body]));
        if (policies.some((policy) => typeof bodies[policy.versionId] !== "string")) throw new Error("Policies unavailable");
        setPolicyBodies(bodies);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPolicyLoadFailed(true);
      });
    return () => controller.abort();
  }, [step, reviewStep, policies, policyBodies]);

  return (
    <section className="vf-registration-experience" aria-labelledby="registration-flow-title" data-registration-ready={isReady || undefined}>
      <div className="vf-registration-main">
        <div className="vf-registration-stepper" aria-label="Registration progress">
          {stepLabels.map((label, index) => (
            <div key={label} data-active={index === step || undefined} data-complete={index < step || undefined}>
              <span>{index < step ? <Check size={14} /> : index + 1}</span><strong>{label}</strong>
            </div>
          ))}
        </div>

        <div className="vf-registration-panel">
          {step === 0 ? (
            <div className="vf-stack">
              <div><p className="vf-label">{stepLabel}</p><h2 id="registration-flow-title">Choose your ticket</h2><p className="vf-muted">Select the experience that fits your convention weekend.</p></div>
              <div className="vf-public-tier-list">
                {tiers.map((tier) => (
                  <label key={tier.id} data-selected={tier.id === selectedTierId || undefined} data-disabled={tier.soldOut || undefined}>
                    <input type="radio" name="tier-preview" value={tier.id} checked={tier.id === selectedTierId} disabled={tier.soldOut} onChange={() => setSelectedTierId(tier.id)} />
                    <span><strong>{tier.name}</strong><small>{tier.soldOut ? "Sold out" : tier.remaining != null ? `${tier.remaining} remaining` : "Available"}</small></span>
                    <b>{formatCurrency(tier.currentPrice, currency)}</b>
                  </label>
                ))}
              </div>
              <div className="vf-registration-actions"><span /><Button type="button" variant="primary" disabled={!selectedTier} onClick={() => setStep(1)}>Continue <ChevronRight size={16} /></Button></div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="vf-stack">
              <AttendeeStep eventId={eventId} stepLabel={stepLabel} selectedId={attendee?.id ?? null} onSelectionChange={selectAttendee} />
              {selectedTier?.addOns.length ? (
                <div className="vf-stack"><div><h3>Enhance your ticket</h3><p className="vf-muted">Optional add-ons for {selectedTier.name}.</p></div>
                  <div className="vf-addon-list">{selectedTier.addOns.map((addOn) => (
                    <label key={addOn.id}><span><strong>{addOn.name}</strong><small>{addOn.isComplimentary ? "Included" : formatCurrency(addOn.price, currency)}</small></span><input aria-label={`${addOn.name} quantity`} type="number" min="0" max={addOn.maxQuantity} value={quantities[addOn.id] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [addOn.id]: Math.max(0, Math.min(addOn.maxQuantity, Number(event.target.value))) }))} /></label>
                  ))}</div>
                </div>
              ) : null}
              <label>Voucher code <span className="vf-optional">Optional</span><input value={voucherCode} onChange={(event) => setVoucherCode(event.target.value.toUpperCase())} placeholder="Enter code" /></label>
              <div className="vf-registration-actions"><Button type="button" onClick={() => setStep(0)}><ChevronLeft size={16} />Back</Button><Button type="button" variant="primary" disabled={!attendeeValid} onClick={() => setStep(2)}>{hasDetails ? "Continue" : "Review"} <ChevronRight size={16} /></Button></div>
            </div>
          ) : null}

          {hasDetails && step === 2 ? <DetailsStep form={form} fullName={attendee?.fullName ?? ""} stepLabel={stepLabel}
            drafts={drafts} responses={responses} onContactsChange={setDrafts}
            onValueChange={(id, value) => setResponses((current) => ({ ...current, [id]: value }))}
            onBack={() => setStep(1)} onContinue={(value) => { setDetails(value); setStep(reviewStep); }} /> : null}

          {step === reviewStep && selectedTier ? (
            <form action={submitAction} className="vf-stack">
              {submitState.error ? (
                <Alert variant="error" data-testid="registration-error">
                  {submitState.error}
                  {submitState.policiesChanged ? <Button type="button" onClick={() => window.location.reload()}>Reload page</Button> : null}
                </Alert>
              ) : null}
              <input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="typeId" value={selectedTier.id} />
              <input type="hidden" name="attendeeProfileId" value={attendee?.id ?? ""} /><input type="hidden" name="voucherCode" value={voucherCode} />
              {selectedTier.addOns.map((addOn) => <input key={addOn.id} type="hidden" name={`addon-${addOn.id}`} value={quantities[addOn.id] ?? 0} />)}
              {form.contacts.mode !== "off" ? drafts.slice(0, form.contacts.count).flatMap((draft, index) => Object.entries(draft).map(([field, value]) => <input key={`contact-${index}-${field}`} type="hidden" name={`contact-${index}-${field}`} value={value} />)) : null}
              {form.questions.map((field) => {
                const value = responses[field.id];
                return field.type === "checkbox" && value !== true ? null : <input key={field.id} type="hidden" name={`field-${field.id}`} value={String(value ?? "")} />;
              })}
              <div><p className="vf-label">{stepLabel}</p><h2 id="registration-flow-title">Review registration</h2><p className="vf-muted">Confirm the attendee and ticket before continuing to secure checkout.</p></div>
              <dl className="vf-review-list"><div><dt>Ticket</dt><dd>{selectedTier.name}</dd></div><div><dt>Attendee</dt><dd>{attendee?.fullName}{attendee?.badgeName ? <small>Badge: {attendee.badgeName}</small> : null}<small>{account.email}</small></dd></div>{selectedAddOns.map((addOn) => <div key={addOn.id}><dt>Add-on</dt><dd>{addOn.name} × {quantities[addOn.id]}</dd></div>)}{voucherCode ? <div><dt>Voucher</dt><dd>{voucherCode}</dd></div> : null}</dl>
              {hasDetails ? <>
                <dl className="vf-review-list">
                  {form.contacts.mode !== "off" ? <div><dt>Emergency contacts</dt><dd>{details?.contacts?.map((contact, index) => <div key={index}>{contact.name} · {formatPhone(contact)}</div>)}</dd></div> : null}
                  {form.questions.length > 0 ? <div><dt>Answers</dt><dd>{buildAnswerRows(form.questions, details?.responses ?? {}).map((answer) => <div key={answer.questionId}>{answer.label}: {answer.value ?? ""}</div>)}</dd></div> : null}
                </dl>
                <Button type="button" onClick={() => setStep(2)} isDisabled={isSubmitPending}>Edit details</Button>
              </> : null}
              <input type="hidden" name="registrationFormVersion" value={formVersion} />
              {policyBodies ? <PolicyAgreementFields
                policies={policies.map((policy) => ({ ...policy, content: <ConstrainedMarkdown source={policyBodies[policy.versionId] ?? ""} baseLevel={4} /> }))}
                agreed={agreed} onAgreedChange={(id, checked) => setAgreed((current) => ({ ...current, [id]: checked }))} />
                : policyLoadFailed ? <Alert variant="error">Policies could not be loaded. Refresh the page to try again.</Alert>
                : <p role="status">Loading policies…</p>}
              <div className="vf-secure-note"><LockKeyhole size={17} /><span>Payment details are handled securely by Stripe or SePay. vFurst never stores card numbers.</span></div>
              <div className="vf-registration-actions"><Button type="button" onClick={() => setStep(reviewStep - 1)} isDisabled={isSubmitPending}><ChevronLeft size={16} />Back</Button><div><Button label="Add to cart" name="checkoutMode" value="cart" type="submit" isDisabled={isSubmitPending || !allPoliciesAgreed} /><Button label={isSubmitPending ? "Submitting..." : estimatedTotal === 0 ? "Complete registration" : "Continue to payment"} name="checkoutMode" value="stripe" type="submit" variant="primary" isDisabled={isSubmitPending || !allPoliciesAgreed} /></div></div>
            </form>
          ) : null}
        </div>
      </div>

      <aside className="vf-registration-summary" aria-label="Order summary">
        <p className="vf-label">Your registration</p>
        <h3>{selectedTier?.name ?? "Choose a ticket"}</h3>
        <div>{selectedTier ? <><span>Ticket</span><strong>{formatCurrency(selectedTier.currentPrice, currency)}</strong></> : null}</div>
        {selectedAddOns.map((addOn) => <div key={addOn.id}><span>{addOn.name} × {quantities[addOn.id]}</span><strong>{addOn.isComplimentary ? "Included" : formatCurrency(addOn.price * (quantities[addOn.id] ?? 0), currency)}</strong></div>)}
        <div className="vf-registration-total"><span>Estimated total</span><strong>{formatCurrency(estimatedTotal, currency)}</strong></div>
        <small>Final discounts and availability are verified when you submit.</small>
      </aside>
    </section>
  );
}
