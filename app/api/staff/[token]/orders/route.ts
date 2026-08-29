import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateStaffLink } from "@/lib/staff-link";
import { sortByDongUnitDesc } from "@/lib/format";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await validateStaffLink(token);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  const { link, allowedNames } = result;

  const supabase = createAdminClient();

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, title")
    .eq("id", link.campaign_id)
    .single();

  const { data: orders } = await supabase
    .from("orders")
    .select(
      "id, nickname, phone, address, dong, unit_no, delivery_status, total_amount, order_items(product_name_snapshot, quantity)"
    )
    .eq("campaign_id", link.campaign_id)
    .eq("fulfillment_type", "배송")
    .eq("payment_status", "입금확인완료")
    .is("cancelled_at", null)
    .in("complex_name", allowedNames.length > 0 ? allowedNames : ["__none__"]);

  const sorted = sortByDongUnitDesc(orders ?? []);
  const doneCount = sorted.filter((o) => o.delivery_status === "배송완료").length;

  return NextResponse.json({
    campaign,
    feePerOrder: link.fee_per_order,
    totalCount: sorted.length,
    doneCount,
    orders: sorted,
  });
}
