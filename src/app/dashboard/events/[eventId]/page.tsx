import { EventDetailClient } from "@/features/events/event-detail-client";

type EventPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function EventPage({ params }: EventPageProps) {
  const { eventId } = await params;
  return <EventDetailClient eventId={eventId} />;
}
