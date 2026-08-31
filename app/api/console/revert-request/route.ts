import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConsoleAuthed } from "@/lib/console-auth";

export async function POST(req: NextRequest) {
  if (!(await isConsoleAuthed())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const { requestId } = (await req.json()) as { requestId?: string };
  if (!requestId) {
    return NextResponse.json({ error: "요청 ID가 필요합니다." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("revert_credit_purchase", { p_request_id: requestId });
  if (error) {
    return NextResponse.json({ error: "되돌리기에 실패했습니다: " + error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
