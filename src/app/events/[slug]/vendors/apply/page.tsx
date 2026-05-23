import { VendorApplicationClient } from "@/features/vendors/vendor-application-client";

type VendorApplyPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function VendorApplyPage({ params }: VendorApplyPageProps) {
  const { slug } = await params;
  return <VendorApplicationClient slug={slug} />;
}
