import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { event: { update: vi.fn() } },
  requireEventAccess: vi.fn(),
  revalidatePath: vi.fn(),
  revalidatePublicRegistration: vi.fn()
}));

vi.mock("@vfurst/db", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/dashboard-access", () => ({ requireEventAccess: mocks.requireEventAccess }));
vi.mock("@/lib/rate-limit", () => ({
  RateLimitExceededError: class RateLimitExceededError extends Error {}
}));
vi.mock("@/lib/organization-lifecycle", () => ({
  OrganizationLifecycleError: class OrganizationLifecycleError extends Error {}
}));
vi.mock("@vfurst/auth/invitations", () => ({
  OrganizationInvitationError: class OrganizationInvitationError extends Error {}
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/public-registration", () => ({ revalidatePublicRegistration: mocks.revalidatePublicRegistration }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));

import { saveRegistrationForm } from "./registration-form-actions";
import { toStoredRegistrationForm } from "@/lib/registration-form";

const eventId = "00000000-0000-4000-8000-000000000001";
const event = { id: "00000000-0000-4000-8000-000000000002", orgId: "org-one" };

function formData() {
  const form = new FormData();
  form.set("eventId", eventId);
  form.set("contactsMode", "required");
  form.set("contactsCount", "2");
  form.set("questions", JSON.stringify([
    { id: " food ", type: "select", label: " Food preference ", required: true, options: [" Vegan ", " Other "] }
  ]));
  return form;
}

describe("registration form settings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireEventAccess.mockResolvedValue({ event });
    mocks.prisma.event.update.mockResolvedValue(event);
  });

  it("saves the normalized form for an authorized event", async () => {
    await expect(saveRegistrationForm({}, formData())).resolves.toEqual({ success: "Registration form saved." });

    expect(mocks.requireEventAccess).toHaveBeenCalledExactlyOnceWith(eventId);
    expect(mocks.prisma.event.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: event.id },
      data: {
        registrationForm: toStoredRegistrationForm({
          contacts: { mode: "required", count: 2 },
          questions: [{ id: "food", type: "select", label: "Food preference", required: true, options: ["Vegan", "Other"] }]
        })
      }
    });
    expect(mocks.revalidatePath).toHaveBeenCalledExactlyOnceWith(`/dashboard/events/${event.id}/settings/registration-form`);
    expect(mocks.revalidatePublicRegistration).toHaveBeenCalledOnce();
  });

  it("returns the first limit message inline", async () => {
    const form = formData();
    form.set("questions", JSON.stringify(Array.from({ length: 31 }, (_, index) => ({
      id: `question-${index}`, type: "text", label: `Question ${index}`, required: false
    }))));

    await expect(saveRegistrationForm({}, form)).resolves.toEqual({ error: "A form can have at most 30 questions." });

    expect(mocks.prisma.event.update).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.revalidatePublicRegistration).not.toHaveBeenCalled();
  });

  it("an access failure is thrown, not returned", async () => {
    const failure = new Error("Event not found.");
    mocks.requireEventAccess.mockRejectedValue(failure);

    await expect(saveRegistrationForm({}, formData())).rejects.toBe(failure);

    expect(mocks.prisma.event.update).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(mocks.revalidatePublicRegistration).not.toHaveBeenCalled();
  });
});
