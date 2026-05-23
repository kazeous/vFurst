import { CheckInClient } from "@/features/check-in/check-in-client";

type CheckInPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function CheckInPage({ params }: CheckInPageProps) {
  const { eventId } = await params;
  return <CheckInClient eventId={eventId} />;
}
