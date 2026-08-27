import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { campaignId, phone } = await req.json();
  if (!campaignId || !phone) {
    return NextResponse.json({ count: 0 });
  }
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("phone", phone)
    .neq("payment_status", "주문취소(미입금)");

  return NextResponse.json({ count: count ?? 0 });
}
