import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 마감된 공구만 삭제 가능(진행중 공구는 실수 방지를 위해 막음).
// campaigns 삭제 시 products/orders/order_items/order_status_logs는
// on delete cascade로 함께 삭제된다.
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

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, is_closed, owner_id")
    .eq("id", id)
    .single();

  if (!campaign) {
    return NextResponse.json({ error: "공구를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!campaign.is_closed) {
    return NextResponse.json(
      { error: "진행중인 공구는 삭제할 수 없습니다. 먼저 마감해주세요." },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("campaigns").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "삭제 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
