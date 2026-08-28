import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateStaffLink } from "@/lib/staff-link";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const { orderId } = await req.json();
  const result = await validateStaffLink(token);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  const { link, allowedNames } = result;

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, delivery_status, complex_name")
    .eq("id", orderId)
    .eq("campaign_id", link.campaign_id)
    .single();

  if (!order || !allowedNames.includes(order.complex_name || "")) {
    return NextResponse.json({ error: "처리 권한이 없는 주문입니다." }, { status: 403 });
  }

  let error = null;
  if (order.delivery_status === "배송중") {
    ({ error } = await supabase.rpc("set_delivery_status_safe", {
      p_order_id: orderId,
      p_from: "배송중",
      p_to: "배송준비",
    }));
  } else if (order.delivery_status === "배송완료") {
    ({ error } = await supabase.rpc("set_delivery_status_safe", {
      p_order_id: orderId,
      p_from: "배송완료",
      p_to: "배송중",
    }));
  } else {
    return NextResponse.json({ error: "되돌릴 수 없는 상태입니다." }, { status: 400 });
  }

  if (error) {
    return NextResponse.json({ error: "되돌리기에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
