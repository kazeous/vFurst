"use client";

import type { ReactNode } from "react";

export type AgreementPolicySummary = { documentId: string; versionId: string; version: number; title: string };
export type AgreementPolicy = AgreementPolicySummary & { content: ReactNode };

export function PolicyAgreementFields({ policies, agreed, onAgreedChange }: {
  policies: AgreementPolicy[];
  agreed?: Record<string, boolean>;
  onAgreedChange?: (documentId: string, checked: boolean) => void;
}) {
  return <>
    <input type="hidden" name="shownPolicyVersions" value={policies.map((policy) => policy.versionId).join(",")} />
    {policies.map((policy) => <section key={policy.documentId} className="vf-stack">
      <h3>{policy.title}</h3>
      <div tabIndex={0} role="region" aria-label={policy.title} style={{ maxHeight: "20rem", overflowY: "auto" }}>{policy.content}</div>
      <label className="vf-check"><input type="checkbox" name={`agreement-${policy.documentId}`} value={policy.versionId}
        {...(onAgreedChange ? { checked: agreed?.[policy.documentId] ?? false, onChange: (event) => onAgreedChange(policy.documentId, event.target.checked) }
          : { defaultChecked: agreed?.[policy.documentId] ?? false, required: true })} />I have read and agree to the {policy.title}</label>
    </section>)}
  </>;
}
