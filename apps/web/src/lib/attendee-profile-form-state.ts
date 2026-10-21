import type { ActionFormState } from "@/lib/action-form-state";

export type AttendeeProfileFormState = ActionFormState & { profileId?: string };
export const initialAttendeeProfileFormState: AttendeeProfileFormState = {};
