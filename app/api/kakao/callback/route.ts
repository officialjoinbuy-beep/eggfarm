import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeKakaoCode } from "@/lib/kakao";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/kakao/callback`;

  if (!code) {
    return NextResponse.redirect(`${origin}/admin?kakao=error`);
  }

  let tokens;
  try {
    tokens = await exchangeKakaoCode(code, redirectUri);
  } catch {
    return NextResponse.redirect(`${origin}/admin?kakao=error`);
  }

  if (state === "admin") {
    // 진행자(ARININE) 본인용 - DB에 저장하지 않고, 화면에 refresh_token을 보여줘서
    // Vercel 환경변수(KAKAO_ADMIN_REFRESH_TOKEN)에 직접 등록하도록 안내한다.
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    return NextResponse.redirect(
      `${origin}/console/kakao-setup?refresh_token=${encodeURIComponent(
        tokens.refresh_token
      )}&expires_at=${encodeURIComponent(expiresAt)}`
    );
  }

  // 공구 진행자 본인용 - 로그인 세션 확인 후 account_limits에 토큰 저장
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(`${origin}/admin/login`);
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const adminSupabase = createAdminClient();
  const { error: updateError } = await adminSupabase
    .from("account_limits")
    .update({
      kakao_access_token: tokens.access_token,
      kakao_refresh_token: tokens.refresh_token,
      kakao_token_expires_at: expiresAt,
    })
    .eq("owner_id", user.id);

  if (updateError) {
    console.error("카카오 토큰 저장 실패:", updateError);
    return NextResponse.redirect(`${origin}/admin?kakao=error`);
  }

  return NextResponse.redirect(`${origin}/admin?kakao=connected`);
}
