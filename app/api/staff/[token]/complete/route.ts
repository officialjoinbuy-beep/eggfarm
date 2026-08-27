import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateStaffLink } from "@/lib/staff-link";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const result = await validateStaffLink(token);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  const { link, allowedNames } = result;

  const formData = await req.formData();
  const orderId = formData.get("orderId") as string | null;
  const file = formData.get("photo") as File | null;
  if (!orderId || !file) {
    return NextResponse.json({ error: "필수 정보가 누락되었습니다." }, { status: 400 });
  }

  const supabase = createAdminClient();

  // 이 담당자가 담당하는 단지의 주문인지 검증
  const { data: order } = await supabase
    .from("orders")
    .select("id, complex_name")
    .eq("id", orderId)
    .eq("campaign_id", link.campaign_id)
    .single();

  if (!order || !allowedNames.includes(order.complex_name || "")) {
    return NextResponse.json({ error: "처리 권한이 없는 주문입니다." }, { status: 403 });
  }

  const path = `${orderId}/${Date.now()}.jpg`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("delivery-photos")
    .upload(path, arrayBuffer, { contentType: "image/jpeg", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: "사진 업로드에 실패했습니다." }, { status: 500 });
  }

  const { error } = await supabase.rpc("set_delivery_status_safe", {
    p_order_id: orderId,
    p_from: "배송중",
    p_to: "배송완료",
  });
  if (error) {
    return NextResponse.json({ error: "상태 업데이트에 실패했습니다." }, { status: 500 });
  }

  await supabase.from("orders").update({ delivery_photo_url: path }).eq("id", orderId);

  return NextResponse.json({ ok: true });
}
