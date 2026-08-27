import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// service_role 키는 RLS를 우회하는 최고 권한 키다.
// 이 파일은 "server-only" 패키지로 보호되어 있어 클라이언트 번들에
// 절대 포함되지 않는다. API route(app/api/**)에서만 import할 것.
// 구매자 주문접수/조회처럼 RLS로는 표현하기 어려운 로직(재고 원자적 처리,
// PIN 해시 검증 등)을 서버에서 직접 수행하기 위해 사용한다.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
