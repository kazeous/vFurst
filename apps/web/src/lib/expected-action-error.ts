/** A client-safe error type for expected, user-correctable action input. */
export class ExpectedActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpectedActionError";
  }
}
