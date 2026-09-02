import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 진행자 본인의 전체 공구를 합산해, 상품별 판매현황과 재구매 고객 비율을
// 보여주는 리포트. "완료" 기준(배송완료/픽업 수령완료 - delivery_revenue_log에
// 기록된 건)으로 집계해, 캘린더 위 "완료 매출" 카드와 같은 기준을 쓴다.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: revenueLog } = await supabase
    .from("delivery_revenue_log")
    .select("order_id, campaign_id, campaign_title, amount")
    .eq("owner_id", user.id);

  const completedOrderIds = (revenueLog ?? []).map((r) => r.order_id);
  if (completedOrderIds.length === 0) {
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
    .select("id, phone, total_amount, order_items(product_name_snapshot, quantity, unit_price)")
    .in("id", completedOrderIds);

  const rows = orders ?? [];
  const totalOrders = rows.length;
  const totalRevenue = (revenueLog ?? []).reduce((s, r) => s + r.amount, 0);

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

  // 공구별 집계 (delivery_revenue_log 기준 - 공구가 삭제돼도 campaign_title이 남아있어 계속 표시됨)
  const campaignMap = new Map<string, { title: string; orders: number; revenue: number }>();
  for (const r of revenueLog ?? []) {
    const key = r.campaign_id ?? r.campaign_title;
    const cur = campaignMap.get(key) ?? { title: r.campaign_title, orders: 0, revenue: 0 };
    cur.orders += 1;
    cur.revenue += r.amount;
    campaignMap.set(key, cur);
  }
  const byCampaign = Array.from(campaignMap.entries())
    .map(([campaignId, v]) => ({ campaignId, title: v.title, orders: v.orders, revenue: v.revenue }))
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
