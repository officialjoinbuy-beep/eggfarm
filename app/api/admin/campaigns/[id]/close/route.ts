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

// 마감취소: 조기마감을 되돌려 다시 주문접수를 받을 수 있게 한다.
// 기존에 쌓인 주문/배송/입금 데이터는 전혀 건드리지 않고, 위임배송 링크가
// 하나라도 살아있으면(무효화 전) 막는다 - 위임 중인 단지가 갑자기
// 상태가 애매해지는 걸 방지하기 위함.
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

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, is_closed")
    .eq("id", id)
    .eq("owner_id", user.id)
    .single();
  if (!campaign) {
    return NextResponse.json({ error: "공구를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!campaign.is_closed) {
    return NextResponse.json({ error: "이미 진행중인 공구입니다." }, { status: 400 });
  }

  const { error } = await supabase.rpc("reopen_campaign", { p_campaign_id: id });
  if (error) {
    if (error.message?.includes("HAS_ACTIVE_STAFF_LINK")) {
      return NextResponse.json(
        { error: "위임배송 링크가 살아있어 마감취소할 수 없습니다. 먼저 링크를 무효화해주세요." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "마감취소 처리 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
