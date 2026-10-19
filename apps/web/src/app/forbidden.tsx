import { DashboardAccessDenied } from "@/components/dashboard/access-denied";

// Next renders the root forbidden boundary into every page, including the
// ISR /{slug}/register route. Reading the session here (auth() -> headers())
// turns that route dynamic at runtime and fails it with a 500, so the
// signed-in identity is read on the client instead.
export default function ForbiddenPage() {
  return <DashboardAccessDenied />;
}
