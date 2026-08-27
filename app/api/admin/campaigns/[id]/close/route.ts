import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 마감은 되돌릴 수 없는 액션. is_closed=true로 원자적 업데이트하는 순간
// 이후 들어오는 주문접수(create_order RPC)는 CAMPAIGN_CLOSED로 거절된다.
export async function POST(
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

  const { error } = await supabase
    .from("campaigns")
    .update({ is_closed: true, closed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: "마감 처리 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
