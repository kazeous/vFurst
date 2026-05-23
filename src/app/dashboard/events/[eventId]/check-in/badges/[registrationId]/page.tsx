import { BadgePrintClient } from "@/features/check-in/badge-print-client";

type BadgePageProps = {
  params: Promise<{
    eventId: string;
    registrationId: string;
  }>;
};

export default async function BadgePage({ params }: BadgePageProps) {
  const { eventId, registrationId } = await params;
  return <BadgePrintClient eventId={eventId} registrationId={registrationId} />;
}
