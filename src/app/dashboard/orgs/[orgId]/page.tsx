import { OrganizationDetailClient } from "@/features/organizations/organization-detail-client";

type OrganizationPageProps = {
  params: Promise<{
    orgId: string;
  }>;
};

export default async function OrganizationPage({ params }: OrganizationPageProps) {
  const { orgId } = await params;
  return <OrganizationDetailClient organizationId={orgId} />;
}
