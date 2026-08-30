import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConsoleAuthed } from "@/lib/console-auth";

// 진행자 전용 - 크레딧 구매요청을 승인 처리(한도 증량 + 이력 기록).
// 체험(eggfarm) 계정은 콘솔과 같은 DB를 쓰므로 이 자리에서 바로 한도가 늘어난다.
// 이미 납품 완료되어 별도 DB로 옮겨간 고객은 이 목록에 없으므로, 그쪽은 여전히
// 재초대받아 increase_campaign_limit을 직접 실행하는 수동 절차를 그대로 따른다.
export async function POST(req: NextRequest) {
  if (!(await isConsoleAuthed())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const { requestId } = (await req.json()) as { requestId?: string };
  if (!requestId) {
    return NextResponse.json({ error: "요청 ID가 필요합니다." }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: reqRow } = await supabase
    .from("credit_purchase_requests")
    .select("id, owner_id, credit_amount, product_name, status")
    .eq("id", requestId)
    .single();

  if (!reqRow) {
    return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
  }
  if (reqRow.status === "완료") {
    return NextResponse.json({ error: "이미 처리된 요청입니다." }, { status: 400 });
  }

  const { data: limitRow } = await supabase
    .from("account_limits")
    .select("campaign_limit")
    .eq("owner_id", reqRow.owner_id)
    .single();

  const newLimit = (limitRow?.campaign_limit ?? 0) + reqRow.credit_amount;

  const { error: rpcError } = await supabase.rpc("increase_campaign_limit", {
    p_owner_id: reqRow.owner_id,
    p_new_limit: newLimit,
    p_product_name: reqRow.product_name,
  });
  if (rpcError) {
    return NextResponse.json({ error: "한도 반영에 실패했습니다." }, { status: 500 });
  }

  await supabase
    .from("credit_purchase_requests")
    .update({ status: "완료", applied_at: new Date().toISOString() })
    .eq("id", requestId);

  return NextResponse.json({ ok: true, newLimit });
}
