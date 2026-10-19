// Client-safe module: shared state shape for public-flow Server Actions that
// report expected user conditions as structured form state instead of throwing.
export type PublicFormState = {
  error?: string;
  redirectTo?: string;
};

export const initialPublicFormState: PublicFormState = {};
