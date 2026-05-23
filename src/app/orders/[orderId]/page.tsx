import { OrderDetailClient } from "@/features/orders/order-detail-client";

type OrderPageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

export default async function OrderPage({ params }: OrderPageProps) {
  const { orderId } = await params;
  return <OrderDetailClient orderId={orderId} />;
}
