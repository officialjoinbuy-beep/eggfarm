import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 오판된 노쇼 처리를 관리자가 직접 제외할 수 있게 한다. 원본 전화번호가
// 없어 되돌릴 대상을 해시로만 특정하지만, 이 owner의 데이터에만 적용되므로
// 안전하다(RLS + RPC 내부 owner_id 조건).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ hash: string }> }
) {
  const { hash } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { error } = await supabase.rpc("exclude_noshow_group", {
    p_owner_id: user.id,
    p_phone_hash: hash,
  });
  if (error) {
    return NextResponse.json({ error: "차단 해제에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
