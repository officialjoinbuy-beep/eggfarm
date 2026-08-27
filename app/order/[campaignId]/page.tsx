import { createAdminClient } from "@/lib/supabase/admin";
import OrderForm from "./OrderForm";
import BuyerNav from "@/components/BuyerNav";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  const supabase = createAdminClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, title, is_closed")
    .eq("id", campaignId)
    .single();

  if (!campaign) {
    return (
      <main className="max-w-md mx-auto p-5">
        <p className="text-center text-neutral-500 py-20">
          공구 페이지를 찾을 수 없습니다.
        </p>
      </main>
    );
  }

  if (campaign.is_closed) {
    return (
      <main className="max-w-md mx-auto p-5">
        <BuyerNav campaignId={campaignId} active="order" />
        <p className="text-center text-neutral-500 py-20">
          이 공구는 마감되었습니다.
        </p>
      </main>
    );
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, stock_limit, stock_reserved")
    .eq("campaign_id", campaignId)
    .order("display_order");

  return (
    <main className="max-w-md mx-auto p-5">
      <BuyerNav campaignId={campaignId} active="order" />
      <OrderForm
        campaignId={campaignId}
        title={campaign.title}
        products={products ?? []}
      />
    </main>
  );
}
