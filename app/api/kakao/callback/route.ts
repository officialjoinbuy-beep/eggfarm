import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeKakaoCode } from "@/lib/kakao";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const origin = req.nextUrl.origin;
  const redirectUri = `${origin}/api/kakao/callback`;

  console.log("[kakao callback] 시작. code 존재:", !!code, "state:", state);

  if (!code) {
    console.error("[kakao callback] code 파라미터 없음");
    return NextResponse.redirect(`${origin}/admin?kakao=error`);
  }

  let tokens;
  try {
    tokens = await exchangeKakaoCode(code, redirectUri);
    console.log(
      "[kakao callback] 토큰 교환 성공. access_token 존재:",
      !!tokens.access_token,
      "refresh_token 존재:",
      !!tokens.refresh_token
    );
  } catch (e) {
    console.error("[kakao callback] 토큰 교환 실패:", e);
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
  console.log("[kakao callback] 로그인 세션 user.id:", user?.id ?? "없음");
  if (!user) {
    console.error("[kakao callback] 로그인 세션이 없어 로그인 페이지로 이동");
    return NextResponse.redirect(`${origin}/admin/login`);
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const adminSupabase = createAdminClient();
  const { data: updatedRows, error: updateError } = await adminSupabase
    .from("account_limits")
    .update({
      kakao_access_token: tokens.access_token,
      kakao_refresh_token: tokens.refresh_token,
      kakao_token_expires_at: expiresAt,
    })
    .eq("owner_id", user.id)
    .select();

  console.log(
    "[kakao callback] update 결과. 영향받은 행 수:",
    updatedRows?.length ?? 0,
    "에러:",
    updateError ? JSON.stringify(updateError) : "없음"
  );

  if (updateError) {
    console.error("[kakao callback] 토큰 저장 실패(에러):", updateError, "user.id:", user.id);
    return NextResponse.redirect(`${origin}/admin?kakao=error`);
  }
  if (!updatedRows || updatedRows.length === 0) {
    console.error("[kakao callback] 대상 행 없음 - upsert로 재시도. user.id:", user.id);
    const { data: upsertData, error: upsertError } = await adminSupabase
      .from("account_limits")
      .upsert(
        {
          owner_id: user.id,
          kakao_access_token: tokens.access_token,
          kakao_refresh_token: tokens.refresh_token,
          kakao_token_expires_at: expiresAt,
        },
        { onConflict: "owner_id" }
      )
      .select();
    console.log(
      "[kakao callback] upsert 결과:",
      upsertData ? JSON.stringify(upsertData) : "없음",
      "에러:",
      upsertError ? JSON.stringify(upsertError) : "없음"
    );
    if (upsertError) {
      console.error("[kakao callback] 토큰 upsert도 실패:", upsertError);
      return NextResponse.redirect(`${origin}/admin?kakao=error`);
    }
  }

  console.log("[kakao callback] 최종 성공. /admin?kakao=connected로 이동");
  return NextResponse.redirect(`${origin}/admin?kakao=connected`);
}
