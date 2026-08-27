import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// month: "YYYY-MM" (없으면 이번달)
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month"); // "YYYY-MM"
  const now = new Date();
  const [year, month] = monthParam
    ? monthParam.split("-").map(Number)
    : [now.getFullYear(), now.getMonth() + 1];

  const monthStart = new Date(year, month - 1, 1);
  const monthEndExclusive = new Date(year, month, 1);

  // 본인 소유 전체 공구 (달력에 걸치는 공구를 클라이언트에서 판단)
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, title, start_at, close_deadline, closed_at, is_closed, created_at")
    .eq("owner_id", user.id);

  // 이번달 배송완료 매출 합계 (본인 소유 공구의 주문만)
  const { data: deliveredOrders } = await supabase
    .from("orders")
    .select("total_amount, delivery_completed_at, campaigns!inner(owner_id)")
    .eq("delivery_status", "배송완료")
    .eq("campaigns.owner_id", user.id)
    .gte("delivery_completed_at", monthStart.toISOString())
    .lt("delivery_completed_at", monthEndExclusive.toISOString());

  const monthRevenue = (deliveredOrders ?? []).reduce(
    (sum, o) => sum + o.total_amount,
    0
  );
  const monthDeliveredCount = (deliveredOrders ?? []).length;

  return NextResponse.json({
    monthRevenue,
    monthDeliveredCount,
    campaigns: campaigns ?? [],
  });
}
