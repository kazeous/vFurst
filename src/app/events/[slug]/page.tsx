import { PublicEventClient } from "@/features/public-events/public-event-client";

type PublicEventPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function PublicEventPage({ params }: PublicEventPageProps) {
  const { slug } = await params;
  return <PublicEventClient slug={slug} />;
}
