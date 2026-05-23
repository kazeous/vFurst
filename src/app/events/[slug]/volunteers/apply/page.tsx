import { VolunteerApplicationClient } from "@/features/volunteers/volunteer-application-client";

type VolunteerApplyPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function VolunteerApplyPage({ params }: VolunteerApplyPageProps) {
  const { slug } = await params;
  return <VolunteerApplicationClient slug={slug} />;
}
