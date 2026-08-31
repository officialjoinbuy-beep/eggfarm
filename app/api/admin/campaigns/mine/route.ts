import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    .select("id, title, is_closed, close_deadline, closed_at, start_at, created_at, fulfillment_mode")
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

  const withCounts = await Promise.all(
    (campaigns ?? []).map(async (c) => {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", c.id)
        .neq("payment_status", "주문취소(미입금)")
        .is("cancelled_at", null);
      return { ...c, order_count: count ?? 0, stale_pickup_count: staleCountByCampaign[c.id] ?? 0 };
    })
  );

  const now = Date.now();

  // 진행예정: 시작일시가 아직 안 됨 (달력과 동일 기준)
  const upcoming = withCounts
    .filter((c) => !c.is_closed && c.start_at && new Date(c.start_at).getTime() > now)
    .sort((a, b) => new Date(a.start_at!).getTime() - new Date(b.start_at!).getTime());

  // 진행중: 마감일시가 가까운 순(마감일시 없으면 맨 뒤). 마감됨: 최근 마감순.
  const active = withCounts
    .filter((c) => !c.is_closed && !(c.start_at && new Date(c.start_at).getTime() > now))
    .sort((a, b) => {
      if (!a.close_deadline && !b.close_deadline) return 0;
      if (!a.close_deadline) return 1;
      if (!b.close_deadline) return -1;
      return new Date(a.close_deadline).getTime() - new Date(b.close_deadline).getTime();
    });

  const closed = withCounts
    .filter((c) => c.is_closed)
    .sort((a, b) => {
      const at = a.closed_at ? new Date(a.closed_at).getTime() : 0;
      const bt = b.closed_at ? new Date(b.closed_at).getTime() : 0;
      return bt - at;
    });

  return NextResponse.json({ upcoming, active, closed });
}
