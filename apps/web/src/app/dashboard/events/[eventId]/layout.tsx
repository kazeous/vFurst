import { EventSectionTabs } from "@/components/dashboard/event-section-tabs";
import { requireEventAccess } from "@/lib/dashboard-access";
import { isDashboardResourceId } from "@/lib/dashboard-navigation";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export default async function EventLayout({ children, params }: { children: ReactNode; params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  if (!isDashboardResourceId(eventId)) {
    notFound();
  }

  await requireEventAccess(eventId);

  return (
    <div className="vf-event-content">
      <EventSectionTabs eventId={eventId} />
      {children}
    </div>
  );
}
