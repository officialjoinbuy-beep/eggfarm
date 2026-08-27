import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const { orderIds } = await req.json();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return NextResponse.json({ error: "선택된 주문이 없습니다." }, { status: 400 });
  }

  const { error } = await supabase.rpc("bulk_confirm_payment", { p_order_ids: orderIds });
  if (error) {
    return NextResponse.json({ error: "일괄 처리 중 오류가 발생했습니다." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
