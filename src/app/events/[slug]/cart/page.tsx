import { CartClient } from "@/features/cart/cart-client";

type CartPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function CartPage({ params }: CartPageProps) {
  const { slug } = await params;
  return <CartClient slug={slug} />;
}
