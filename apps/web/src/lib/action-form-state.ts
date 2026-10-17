// Client-safe state shared by organizer and platform Server Action forms.
export type ActionFormState = {
  error?: string;
  success?: string;
  redirectTo?: string;
};

export const initialActionFormState: ActionFormState = {};
