import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 배송완료 후 보유기간(기본 15일)이 지난 배송사진을 Storage에서 삭제한다.
// SQL(pg_cron)은 텍스트 필드만 지울 수 있어, 파일 삭제는 이 API가 대신 처리한다.
// Vercel Cron 또는 외부 스케줄러(예: cron-job.org)로 하루 1회 호출하도록 설정.
// 보안: CRON_SECRET 환경변수와 Authorization 헤더를 대조해 아무나 호출 못하게 막는다.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();

  const { data: targets, error } = await supabase.rpc("list_expired_photo_paths");
  if (error) {
    return NextResponse.json({ error: "대상 조회 실패" }, { status: 500 });
  }

  let deleted = 0;
  for (const row of targets ?? []) {
    if (!row.photo_path) continue;
    await supabase.storage.from("delivery-photos").remove([row.photo_path]);
    await supabase.rpc("clear_photo_url", { p_order_id: row.order_id });
    deleted++;
  }

  // 텍스트 개인정보(닉네임/연락처/주소/단지/동/호수/비밀번호) 삭제
  await supabase.rpc("purge_expired_personal_data");

  return NextResponse.json({ ok: true, deletedPhotos: deleted });
}
