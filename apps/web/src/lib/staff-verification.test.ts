import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), headers: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getStaffSession: mocks.session }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); },
  unstable_rethrow: (error: Error) => { if (error.message.startsWith("NEXT_REDIRECT:")) throw error; }
}));
vi.mock("@/lib/public-action-error", () => ({ expectedActionErrorMessage: () => null }));
import { requireStaffAssurance } from "./staff-verification";
import { runActionWithState } from "./action-state";

const now = new Date("2026-10-19T10:00:00Z");
function session() { return { user: { id: "staff" }, staffSecurity: {
  leaseRequired: false, emailVerified: true, primaryAuthenticatedAt: now.toISOString(), mfaVerifiedAt: now.toISOString(), mfaEnrolled: true
} }; }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  mocks.session.mockResolvedValue(session());
  mocks.headers.mockResolvedValue(new Headers({ referer: "http://localhost:3000/platform/organizations/new", "next-action": "action" }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("staff sensitive-action guard", () => {
  it("accepts current verified primary and MFA evidence", async () => {
    expect(await requireStaffAssurance()).toEqual(session());
  });
  it("returns recoverable verification state only inside a structured form", async () => {
    const stale = session(); stale.staffSecurity.mfaEnrolled = false;
    mocks.session.mockResolvedValue(stale);
    const operation = vi.fn(async () => { await requireStaffAssurance(); });
    expect(await runActionWithState(operation)).toMatchObject({ verificationUrl: "/staff/verify?returnTo=%2Fplatform%2Forganizations%2Fnew", error: expect.stringContaining("entries remain") });
  });
  it("plain Server Action forms redirect instead of throwing an expected error into a boundary", async () => {
    const stale = session(); stale.staffSecurity.mfaEnrolled = false;
    mocks.session.mockResolvedValue(stale);
    await expect(requireStaffAssurance()).rejects.toThrow("NEXT_REDIRECT:/staff/verify");
  });
  it("requires a lease check even for an ordinary staff read", async () => {
    const stale = session(); stale.staffSecurity.leaseRequired = true;
    mocks.session.mockResolvedValue(stale);
    expect(await runActionWithState(async () => { await requireStaffAssurance(false); })).toMatchObject({ verificationUrl: "/login?returnTo=%2Fplatform%2Forganizations%2Fnew" });
  });
  it("never returns to a foreign referrer", async () => {
    const stale = session(); stale.staffSecurity.emailVerified = false;
    mocks.session.mockResolvedValue(stale);
    mocks.headers.mockResolvedValue(new Headers({ referer: "https://other.example/steal" }));
    await expect(requireStaffAssurance()).rejects.toThrow("NEXT_REDIRECT:/staff/verify?returnTo=%2Fdashboard");
  });
});
