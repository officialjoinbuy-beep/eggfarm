import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 이미 배송완료 처리된 건의 사진을 잘못 올렸을 때, 상태 변경 없이 사진만 재업로드한다.
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

  const { data: order } = await supabase
    .from("orders")
    .select("id, delivery_status, campaigns!inner(owner_id)")
    .eq("id", id)
    .single();
  if (!order || order.delivery_status !== "배송완료") {
    return NextResponse.json({ error: "배송완료 상태인 주문만 사진을 재등록할 수 있습니다." }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("photo") as File | null;
  if (!file) {
    return NextResponse.json({ error: "사진을 첨부해주세요." }, { status: 400 });
  }

  const admin = createAdminClient();
  const path = `${id}/${Date.now()}.jpg`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await admin.storage
    .from("delivery-photos")
    .upload(path, arrayBuffer, { contentType: "image/jpeg", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: "사진 업로드에 실패했습니다." }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({ delivery_photo_url: path })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: "저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
