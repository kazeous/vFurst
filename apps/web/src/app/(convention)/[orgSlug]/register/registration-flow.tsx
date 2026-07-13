"use client";

import { createRegistration } from "@/actions/registration-actions";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/registration/pricing";
import { Check, ChevronLeft, ChevronRight, LockKeyhole } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type AddOn = { id: string; name: string; price: number; isComplimentary: boolean; maxQuantity: number };
type Tier = { id: string; name: string; currentPrice: number; soldOut: boolean; remaining?: number; addOns: AddOn[] };

const stepLabels = ["Ticket", "Attendee", "Review"];

export function RegistrationFlow({ orgId, eventId, currency, tiers }: { orgId: string; eventId: string; currency: "USD" | "VND"; tiers: Tier[] }) {
  const availableTier = tiers.find((tier) => !tier.soldOut);
  const [step, setStep] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [selectedTierId, setSelectedTierId] = useState(availableTier?.id ?? "");
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const selectedTier = tiers.find((tier) => tier.id === selectedTierId);
  const selectedAddOns = selectedTier?.addOns.filter((addOn) => (quantities[addOn.id] ?? 0) > 0) ?? [];
  const estimatedTotal = useMemo(() => {
    if (!selectedTier) return 0;
    return selectedTier.currentPrice + selectedAddOns.reduce((sum, addOn) => sum + (addOn.isComplimentary ? 0 : addOn.price) * (quantities[addOn.id] ?? 0), 0);
  }, [quantities, selectedAddOns, selectedTier]);
  const attendeeValid = attendeeName.trim().length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendeeEmail);

  useEffect(() => {
    setIsReady(true);
  }, []);

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
              <div><p className="vf-label">Step 1 of 3</p><h2 id="registration-flow-title">Choose your ticket</h2><p className="vf-muted">Select the experience that fits your convention weekend.</p></div>
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
              <div><p className="vf-label">Step 2 of 3</p><h2 id="registration-flow-title">Attendee details</h2><p className="vf-muted">We will use this information for the attendee record and confirmation.</p></div>
              <div className="vf-form-grid">
                <label>Full name<input name="attendee-preview-name" autoComplete="name" value={attendeeName} onChange={(event) => setAttendeeName(event.target.value)} required /></label>
                <label>Email<input name="attendee-preview-email" type="email" autoComplete="email" value={attendeeEmail} onChange={(event) => setAttendeeEmail(event.target.value)} required /></label>
              </div>
              {selectedTier?.addOns.length ? (
                <div className="vf-stack"><div><h3>Enhance your ticket</h3><p className="vf-muted">Optional add-ons for {selectedTier.name}.</p></div>
                  <div className="vf-addon-list">{selectedTier.addOns.map((addOn) => (
                    <label key={addOn.id}><span><strong>{addOn.name}</strong><small>{addOn.isComplimentary ? "Included" : formatCurrency(addOn.price, currency)}</small></span><input aria-label={`${addOn.name} quantity`} type="number" min="0" max={addOn.maxQuantity} value={quantities[addOn.id] ?? 0} onChange={(event) => setQuantities((current) => ({ ...current, [addOn.id]: Math.max(0, Math.min(addOn.maxQuantity, Number(event.target.value))) }))} /></label>
                  ))}</div>
                </div>
              ) : null}
              <label>Voucher code <span className="vf-optional">Optional</span><input value={voucherCode} onChange={(event) => setVoucherCode(event.target.value.toUpperCase())} placeholder="Enter code" /></label>
              <div className="vf-registration-actions"><Button type="button" onClick={() => setStep(0)}><ChevronLeft size={16} />Back</Button><Button type="button" variant="primary" disabled={!attendeeValid} onClick={() => setStep(2)}>Review <ChevronRight size={16} /></Button></div>
            </div>
          ) : null}

          {step === 2 && selectedTier ? (
            <form action={createRegistration} className="vf-stack">
              <input type="hidden" name="orgId" value={orgId} /><input type="hidden" name="eventId" value={eventId} /><input type="hidden" name="typeId" value={selectedTier.id} />
              <input type="hidden" name="attendeeName" value={attendeeName} /><input type="hidden" name="attendeeEmail" value={attendeeEmail} /><input type="hidden" name="voucherCode" value={voucherCode} />
              {selectedTier.addOns.map((addOn) => <input key={addOn.id} type="hidden" name={`addon-${addOn.id}`} value={quantities[addOn.id] ?? 0} />)}
              <div><p className="vf-label">Step 3 of 3</p><h2 id="registration-flow-title">Review registration</h2><p className="vf-muted">Confirm the attendee and ticket before continuing to secure checkout.</p></div>
              <dl className="vf-review-list"><div><dt>Ticket</dt><dd>{selectedTier.name}</dd></div><div><dt>Attendee</dt><dd>{attendeeName}<small>{attendeeEmail}</small></dd></div>{selectedAddOns.map((addOn) => <div key={addOn.id}><dt>Add-on</dt><dd>{addOn.name} × {quantities[addOn.id]}</dd></div>)}{voucherCode ? <div><dt>Voucher</dt><dd>{voucherCode}</dd></div> : null}</dl>
              <div className="vf-secure-note"><LockKeyhole size={17} /><span>Payment details are handled securely by Stripe or SePay. vFurst never stores card numbers.</span></div>
              <div className="vf-registration-actions"><Button type="button" onClick={() => setStep(1)}><ChevronLeft size={16} />Back</Button><div><Button label="Add to cart" name="checkoutMode" value="cart" type="submit" /><Button label={estimatedTotal === 0 ? "Complete registration" : "Continue to payment"} name="checkoutMode" value="stripe" type="submit" variant="primary" /></div></div>
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
