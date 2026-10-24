import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), context: vi.fn(), rateLimit: vi.fn(), rethrow: vi.fn(), revalidate: vi.fn()
}));
vi.mock("@vfurst/db", () => ({ prisma: { registration: { findFirst: mocks.findFirst, update: mocks.update, updateMany: mocks.updateMany } } }));
vi.mock("@/lib/portal-context", () => ({ getPortalActionContext: mocks.context, isPortalRedirect: (value: object) => "redirectTo" in value }));
vi.mock("@/lib/rate-limit", () => ({ assertActionRateLimit: mocks.rateLimit, RateLimitExceededError: class extends Error {} }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: mocks.rethrow }));

import { PublicActionError } from "@/lib/public-action-error";
import { updateRegistrationAnswers } from "./registration-answer-actions";

const id = "00000000-0000-4000-8000-000000000001";
const ownerWhere = { id, orgId: "org-one", portalAccountId: "account-one" };
const question = { id: "size", label: "Size", type: "select", required: true, options: ["S", "M"] };
function form() {
  const data = new FormData();
  data.set("registrationId", id);
  data.set("field-size", "M");
  return data;
}
function registration() {
  return { id, status: "CONFIRMED", formResponses: { removed: "Preserved", size: "S" }, event: { startDate: new Date("2099-01-01"), registrationForm: { questions: [question] } } };
}

describe("registration answer actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ org: { id: "org-one" }, account: { id: "account-one" } });
    mocks.findFirst.mockResolvedValue(registration());
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("saves merged answers", async () => {
    await expect(updateRegistrationAnswers({}, form())).resolves.toEqual({ redirectTo: `/account/registrations/${id}?notice=answers-saved` });
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: ownerWhere }));
    expect(mocks.updateMany).toHaveBeenCalledExactlyOnceWith({
      where: { ...ownerWhere, status: { in: ["PENDING", "CONFIRMED"] }, event: { startDate: { gt: expect.any(Date) } } },
      data: { formResponses: { removed: "Preserved", size: "M" } }
    });
    expect(mocks.rateLimit).toHaveBeenCalledExactlyOnceWith("portal:registration-answers", "org-one:account-one");
  });

  it("refuses after the lock with the lock message", async () => {
    mocks.findFirst.mockResolvedValue({ ...registration(), event: { ...registration().event, startDate: new Date("2000-01-01") } });
    await expect(updateRegistrationAnswers({}, form())).resolves.toEqual({ error: "Answers can no longer be changed for this registration." });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a cancellation between reading and writing without changing answers", async () => {
    const stored = registration();
    mocks.findFirst.mockImplementation(async () => {
      const snapshot = { ...stored };
      stored.status = "CANCELLED";
      return snapshot;
    });
    const write = async ({ where, data }: {
      where: typeof ownerWhere & { status?: { in: string[] }; event?: { startDate: { gt: Date } } };
      data: { formResponses: typeof stored.formResponses };
    }) => {
      if (where.status && !where.status.in.includes(stored.status)) return { count: 0 };
      if (where.event && stored.event.startDate <= where.event.startDate.gt) return { count: 0 };
      stored.formResponses = data.formResponses;
      return { count: 1 };
    };
    mocks.update.mockImplementation(write);
    mocks.updateMany.mockImplementation(write);

    await expect(updateRegistrationAnswers({}, form())).resolves.toEqual({ error: "Answers can no longer be changed for this registration." });
    expect(stored.formResponses).toEqual({ removed: "Preserved", size: "S" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("another account's registration is not found", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(updateRegistrationAnswers({}, form())).resolves.toEqual({ error: "Registration not found." });
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: ownerWhere }));
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("a required question added later must be answered", async () => {
    mocks.findFirst.mockResolvedValue({ ...registration(), event: { ...registration().event, registrationForm: { questions: [question, { id: "new", label: "New question", type: "text", required: true }] } } });
    await expect(updateRegistrationAnswers({}, form())).resolves.toEqual({ error: "New question is required." });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("returns authentication redirects without reading or writing registrations", async () => {
    mocks.context.mockResolvedValue({ redirectTo: "/login" });
    await expect(updateRegistrationAnswers({}, form())).resolves.toEqual({ redirectTo: "/login" });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("rethrows framework control flow before mapping expected errors", async () => {
    const redirect = new PublicActionError("redirect sentinel");
    mocks.context.mockRejectedValue(redirect);
    mocks.rethrow.mockImplementation(() => { throw redirect; });
    await expect(updateRegistrationAnswers({}, form())).rejects.toBe(redirect);
  });
});
