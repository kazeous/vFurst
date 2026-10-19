import { ExpectedActionError } from "@/lib/expected-action-error";

export class StaffVerificationRequiredError extends ExpectedActionError {
  constructor(readonly verificationUrl: string) {
    super("Verify your Reyuu Games account, then submit this form again. Your entries remain here.");
    this.name = "StaffVerificationRequiredError";
  }
}
