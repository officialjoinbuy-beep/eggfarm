import { createAdminClient } from "@/lib/supabase/admin";
import PayView from "./PayView";

export default async function PayPage({
  params,
}: {
  params: Promise<{ campaignId: string; orderId: string }>;
}) {
  const { campaignId, orderId } = await params;
  const supabase = createAdminClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("bank_name, account_number, account_holder, payment_timeout_minutes")
    .eq("id", campaignId)
    .single();

  const { data: order } = await supabase
    .from("orders")
    .select("total_amount, nickname")
    .eq("id", orderId)
    .single();

  if (!campaign || !order) {
    return (
      <main className="max-w-md mx-auto p-5">
        <p className="text-center text-neutral-500 py-20">주문 정보를 찾을 수 없습니다.</p>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto p-5">
      <PayView
        campaignId={campaignId}
        bankName={campaign.bank_name}
        accountNumber={campaign.account_number}
        accountHolder={campaign.account_holder}
        totalAmount={order.total_amount}
        timeoutMinutes={campaign.payment_timeout_minutes}
      />
    </main>
  );
}
