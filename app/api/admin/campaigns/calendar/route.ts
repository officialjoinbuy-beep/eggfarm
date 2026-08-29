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
    .select("id, title, start_at, close_deadline, closed_at, is_closed, created_at, fulfillment_mode")
    .eq("owner_id", user.id);

  const { data: staleGroups } = await supabase.rpc("list_stale_pending_pickups", {
    p_owner_id: user.id,
    p_days: 7,
  });
  const staleCountByCampaign = Object.fromEntries(
    ((staleGroups ?? []) as { campaign_id: string; stale_count: number }[]).map((g) => [
      g.campaign_id,
      g.stale_count,
    ])
  );
  const campaignsWithStale = (campaigns ?? []).map((c) => ({
    ...c,
    stale_pickup_count: staleCountByCampaign[c.id] ?? 0,
  }));

  // 이번달 배송완료 매출 합계 - 삭제된 공구/주문과 무관하게 영구 보존되는
  // delivery_revenue_log 테이블에서 집계한다(실시간 주문 재계산 방식 폐기).
  const { data: deliveredLogs } = await supabase
    .from("delivery_revenue_log")
    .select("amount")
    .eq("owner_id", user.id)
    .gte("completed_at", monthStart.toISOString())
    .lt("completed_at", monthEndExclusive.toISOString());

  const monthRevenue = (deliveredLogs ?? []).reduce((sum, o) => sum + o.amount, 0);
  const monthDeliveredCount = (deliveredLogs ?? []).length;

  return NextResponse.json({
    monthRevenue,
    monthDeliveredCount,
    campaigns: campaignsWithStale,
  });
}
