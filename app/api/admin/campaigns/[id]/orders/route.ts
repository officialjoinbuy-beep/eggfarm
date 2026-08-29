import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, title, is_closed, payment_timeout_minutes, fulfillment_mode, delivery_fee, close_deadline")
    .eq("id", id)
    .single();
  if (!campaign) {
    return NextResponse.json({ error: "공구를 찾을 수 없습니다." }, { status: 404 });
  }

  const { data: products } = await supabase
    .from("products")
    .select("id, name, stock_limit, stock_reserved")
    .eq("campaign_id", id)
    .order("display_order");

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, nickname, phone, address, complex_name, total_amount, payment_status, delivery_status, payment_deadline, fulfillment_type, payment_method, pickup_status, delivery_fee_charged, delivery_fee_waived, on_site_paid, cancelled_at, refund_status, created_at, order_items(product_name_snapshot, quantity)"
    )
    .eq("campaign_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ campaign, products, orders: orders ?? [] });
}
