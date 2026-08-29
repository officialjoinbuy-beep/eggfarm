import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 체험 계정 정리: (1) 가입 후 7일간 공구를 1건도 만들지 않은 계정,
// (2) 이용한도(기본 10회)를 소진한 뒤 15일이 지난 계정을 삭제한다.
// 계정 삭제 시 campaigns 등 owner_id로 연결된 데이터는 FK cascade로 함께 삭제된다.
// Vercel Cron으로 하루 1회 호출. 보안: CRON_SECRET 대조.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();

  const { data: targets, error } = await supabase.rpc("list_purgeable_trial_accounts");
  if (error) {
    return NextResponse.json({ error: "대상 조회 실패" }, { status: 500 });
  }

  let deleted = 0;
  const failedIds: string[] = [];
  for (const row of targets ?? []) {
    const { error: delError } = await supabase.auth.admin.deleteUser(row.owner_id);
    if (delError) {
      failedIds.push(row.owner_id);
      continue;
    }
    deleted++;
  }

  return NextResponse.json({ ok: true, deleted, failed: failedIds.length });
}
