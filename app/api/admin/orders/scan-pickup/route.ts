import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { campaignId, token } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, nickname, phone, total_amount, pickup_status, cancelled_at, campaign_id, order_items(product_name_snapshot, quantity)"
    )
    .eq("campaign_id", campaignId)
    .eq("pickup_token", token)
    .single();

  if (!order) {
    return NextResponse.json({ error: "일치하는 픽업 주문을 찾을 수 없습니다." }, { status: 404 });
  }
  if (order.cancelled_at) {
    return NextResponse.json({ error: "취소된 주문입니다." }, { status: 409 });
  }
  if (order.pickup_status !== "수령대기") {
    return NextResponse.json(
      { error: `이미 처리된 주문입니다 (${order.pickup_status ?? "알 수 없음"}).` },
      { status: 409 }
    );
  }

  return NextResponse.json({ order });
}
