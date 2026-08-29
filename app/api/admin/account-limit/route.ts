import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 진행자 대시보드 상단 배너에 쓰이는 이용현황(사용량/한도) 조회.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("account_limits")
    .select("campaign_limit, campaigns_created_count")
    .eq("owner_id", user.id)
    .single();

  if (error || !data) {
    // 트리거로 항상 생성되지만, 혹시 없으면 기본값(0/10)으로 응답
    return NextResponse.json({ used: 0, limit: 10 });
  }

  return NextResponse.json({
    used: data.campaigns_created_count,
    limit: data.campaign_limit,
  });
}
