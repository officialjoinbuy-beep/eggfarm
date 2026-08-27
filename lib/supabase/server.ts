import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// 서버 컴포넌트/라우트 핸들러에서 사용. 진행자 로그인 세션(쿠키) 기반으로
// RLS가 "본인 소유 공구만" 접근 가능하도록 자동 제한한다.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // 서버 컴포넌트에서 호출된 경우 무시 (미들웨어에서 세션 갱신)
          }
        },
      },
    }
  );
}
