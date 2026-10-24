export function StaffPolicyAttestation({ policies }: {
  policies: Array<{ versionId: string; version: number; title: string }>;
}) {
  if (policies.length === 0) return null;
  return <>
    <input type="hidden" name="attestedPolicyVersions" value={policies.map((policy) => policy.versionId).join(",")} />
    <label className="vf-check">
      <input type="checkbox" name="policyAttestation" required />
      The attendee has agreed to: {policies.map((policy) => `${policy.title} v${policy.version}`).join(", ")}
    </label>
  </>;
}
