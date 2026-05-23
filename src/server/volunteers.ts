import "server-only";
import { HttpError } from "@/server/http";

export function assertVolunteerApplicationsOpen(event: { status: string }) {
  if (event.status !== "REGISTRATION_OPEN" && event.status !== "LIVE") {
    throw new HttpError(403, "Volunteer applications are not open for this event.");
  }
}
