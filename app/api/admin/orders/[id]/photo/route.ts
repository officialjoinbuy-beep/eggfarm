import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 배송완료 처리: 사진(워터마크는 클라이언트에서 이미 합성되어 전달됨)을
// private 버킷에 업로드하고, 경로를 저장한 뒤 delivery_status를 배송완료로 전환한다.
export async function POST(
  req: NextRequest,
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

  // 소유권 확인
  const { data: order } = await supabase
    .from("orders")
    .select("id, campaigns!inner(owner_id)")
    .eq("id", id)
    .single();
  if (!order) {
    return NextResponse.json({ error: "주문을 찾을 수 없습니다." }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("photo") as File | null;
  const extraOrderIdsRaw = formData.get("extraOrderIds") as string | null;
  let extraOrderIds: string[] = [];
  if (extraOrderIdsRaw) {
    try {
      extraOrderIds = JSON.parse(extraOrderIdsRaw);
    } catch {
      extraOrderIds = [];
    }
  }
  if (!file) {
    return NextResponse.json({ error: "사진을 첨부해주세요." }, { status: 400 });
  }

  // 업로드 자체는 service_role로 처리 (private 버킷, RLS로 클라이언트 직접 업로드 막음)
  const admin = createAdminClient();
  const path = `${id}/${Date.now()}.jpg`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await admin.storage
    .from("delivery-photos")
    .upload(path, arrayBuffer, { contentType: "image/jpeg", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: "사진 업로드에 실패했습니다." }, { status: 500 });
  }

  // 같은 연락처로 대기 중이던 다른 주문들도 진행자가 선택했다면 같은 사진으로
  // 함께 배송완료 처리한다 (문 앞에 한 번 놓고 사진 한 장 찍는 실제 흐름과 맞춤).
  const ids = [id, ...extraOrderIds];
  for (const orderId of ids) {
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        delivery_photo_url: orderId === id ? path : path, // 동일 사진 경로 공유
        delivery_status: "배송완료",
        delivery_completed_at: new Date().toISOString(),
      })
      .eq("id", orderId);
    if (updateError && orderId === id) {
      return NextResponse.json({ error: "상태 업데이트에 실패했습니다." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
