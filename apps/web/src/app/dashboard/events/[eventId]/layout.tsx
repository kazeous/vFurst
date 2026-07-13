import { EventSectionTabs } from "@/components/dashboard/event-section-tabs";
import { requireEventAccess } from "@/lib/dashboard-access";
import type { ReactNode } from "react";

export default async function EventLayout({ children, params }: { children: ReactNode; params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  await requireEventAccess(eventId);

  return (
    <div className="vf-event-content">
      <EventSectionTabs eventId={eventId} />
      {children}
    </div>
  );
}
