import { AsyncLocalStorage } from "node:async_hooks";

// Shared guards can return recoverable state only inside a structured form.
// Plain Server Action forms use a controlled redirect to verification instead.
export const actionStateContext = new AsyncLocalStorage<boolean>();
