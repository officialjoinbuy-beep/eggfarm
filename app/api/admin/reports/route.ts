import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 진행자 본인의 전체 공구를 합산해, 상품별 판매현황과 재구매 고객 비율을
// 보여주는 리포트. 배송/픽업 완료 여부와 무관하게 "입금확인완료"된 주문만
// 매출로 집계한다(대시보드의 "현재 매출" 계산 방식과 동일).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, title, created_at")
    .eq("owner_id", user.id);

  const campaignIds = (campaigns ?? []).map((c) => c.id);
  if (campaignIds.length === 0) {
    return NextResponse.json({
      totalOrders: 0,
      totalRevenue: 0,
      repeatCustomerRate: 0,
      byProduct: [],
      byCampaign: [],
    });
  }

  const { data: orders } = await supabase
    .from("orders")
    .select("id, campaign_id, phone, total_amount, payment_status, cancelled_at, order_items(product_name_snapshot, quantity, unit_price)")
    .in("campaign_id", campaignIds)
    .eq("payment_status", "입금확인완료")
    .is("cancelled_at", null);

  const rows = orders ?? [];
  const totalOrders = rows.length;
  const totalRevenue = rows.reduce((s, o) => s + o.total_amount, 0);

  // 상품별 집계 (상품명 기준 - 같은 이름이 여러 공구에 걸쳐 있으면 합산됨)
  const productMap = new Map<string, { qty: number; revenue: number }>();
  for (const o of rows) {
    for (const item of o.order_items as { product_name_snapshot: string; quantity: number; unit_price: number }[]) {
      const cur = productMap.get(item.product_name_snapshot) ?? { qty: 0, revenue: 0 };
      cur.qty += item.quantity;
      cur.revenue += item.quantity * item.unit_price;
      productMap.set(item.product_name_snapshot, cur);
    }
  }
  const byProduct = Array.from(productMap.entries())
    .map(([name, v]) => ({ name, qty: v.qty, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  // 공구별 집계
  const campaignMap = new Map<string, { orders: number; revenue: number }>();
  for (const o of rows) {
    const cur = campaignMap.get(o.campaign_id) ?? { orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue += o.total_amount;
    campaignMap.set(o.campaign_id, cur);
  }
  const titleById = Object.fromEntries((campaigns ?? []).map((c) => [c.id, c.title]));
  const byCampaign = Array.from(campaignMap.entries())
    .map(([id, v]) => ({ campaignId: id, title: titleById[id] ?? "(삭제된 공구)", orders: v.orders, revenue: v.revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  // 재구매 고객 비율: 전체 구매자(전화번호 기준) 중 2회 이상 주문한 사람의 비율
  const ordersByPhone = new Map<string, number>();
  for (const o of rows) {
    ordersByPhone.set(o.phone, (ordersByPhone.get(o.phone) ?? 0) + 1);
  }
  const totalCustomers = ordersByPhone.size;
  const repeatCustomers = Array.from(ordersByPhone.values()).filter((c) => c >= 2).length;
  const repeatCustomerRate = totalCustomers > 0 ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;

  return NextResponse.json({
    totalOrders,
    totalRevenue,
    repeatCustomerRate,
    byProduct,
    byCampaign,
  });
}
