import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateStaffLink } from "@/lib/staff-link";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { orderIds } = await req.json();
  const result = await validateStaffLink(token);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  const { link, allowedNames } = result;

  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: "선택된 주문이 없습니다." }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 이 담당자가 실제로 담당하는 단지의 주문인지 재검증(다른 단지 주문 조작 방지)
  const { data: valid } = await supabase
    .from("orders")
    .select("id")
    .in("id", orderIds)
    .eq("campaign_id", link.campaign_id)
    .in("complex_name", allowedNames.length > 0 ? allowedNames : ["__none__"]);

  const validIds = (valid ?? []).map((o) => o.id);
  if (validIds.length === 0) {
    return NextResponse.json({ error: "처리 가능한 주문이 없습니다." }, { status: 400 });
  }

  const { error } = await supabase.rpc("bulk_set_shipping", { p_order_ids: validIds });
  if (error) {
    return NextResponse.json({ error: "일괄 처리 중 오류가 발생했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
