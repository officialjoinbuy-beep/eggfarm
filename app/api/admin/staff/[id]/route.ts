import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
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

  // 이 담당자로 발급된 살아있는(무효화 안됐고 만료 안된) 위임배송 링크가
  // 있으면 삭제를 막는다 - 진행 중인 배송담당자 화면 접속이 갑자기
  // 끊기는 사고를 방지하기 위함.
  const { data: liveLinks } = await supabase
    .from("delivery_staff_links")
    .select("id")
    .eq("staff_id", id)
    .eq("revoked", false)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (liveLinks && liveLinks.length > 0) {
    return NextResponse.json(
      { error: "이 담당자로 발급된 살아있는 위임배송 링크가 있어 삭제할 수 없습니다. 먼저 해당 링크를 무효화해주세요." },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("delivery_staff")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: "삭제에 실패했습니다." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
