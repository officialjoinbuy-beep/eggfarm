import { createBrowserClient } from "@supabase/ssr";

// 브라우저(클라이언트 컴포넌트)에서 사용하는 Supabase 클라이언트.
// anon key만 사용하며, RLS 정책에 의해 접근 범위가 제한된다.
// cookieOptions.maxAge를 명시하지 않으면 브라우저가 세션쿠키(브라우저를
// 완전히 종료하면 삭제됨)로 취급할 수 있어, 진행자가 사파리 앱을 껐다 켤
// 때마다 재로그인해야 하는 문제가 있었다 - 30일간 로그인 유지되도록 지정.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        maxAge: 60 * 60 * 24 * 30,
      },
    }
  );
}
