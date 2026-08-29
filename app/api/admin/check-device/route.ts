import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 회원가입 전, 이 브라우저(device_id)가 이미 체험 가입에 쓰인 적 있는지 확인/기록.
// 완전 차단이 아닌 감지·안내 목적 — 시크릿모드/다른 브라우저로는 우회 가능함을 전제로 한다.
export async function POST(req: NextRequest) {
  const { deviceId } = (await req.json()) as { deviceId?: string };
  if (!deviceId || typeof deviceId !== "string" || deviceId.length > 100) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("trial_device_signups")
    .select("signup_count")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("trial_device_signups")
      .update({
        signup_count: existing.signup_count + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq("device_id", deviceId);
    return NextResponse.json({ repeat: true, signupCount: existing.signup_count + 1 });
  }

  await supabase.from("trial_device_signups").insert({ device_id: deviceId });
  return NextResponse.json({ repeat: false, signupCount: 1 });
}
