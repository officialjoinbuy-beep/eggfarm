import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getKakaoAuthorizeUrl } from "@/lib/kakao";

// 공구 진행자 본인이 "카카오 알림 연결하기"를 누르면 여기로 와서 카카오 로그인 화면으로 넘어간다.
// mode=admin이면 운영 콘솔(진행자 ARININE) 전용 인증 플로우로 처리한다.
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") === "admin" ? "admin" : "owner";
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/kakao/callback`;

  if (mode === "owner") {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(`${origin}/admin/login`);
    }
  }

  const state = mode; // owner|admin 구분만 필요, 별도 CSRF 토큰은 세션 쿠키로 대체
  return NextResponse.redirect(getKakaoAuthorizeUrl(redirectUri, state));
}
