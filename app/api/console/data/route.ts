import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConsoleAuthed } from "@/lib/console-auth";

// 진행자 전용 - 전체 가입자 이용현황 + 크레딧 구매요청 대기열 + 한도증량 이력 조회.
export async function GET() {
  if (!(await isConsoleAuthed())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const supabase = createAdminClient();

  const [{ data: limits }, { data: requests }, { data: history }, usersRes] = await Promise.all([
    supabase
      .from("account_limits")
      .select(
        "owner_id, campaign_limit, campaigns_created_count, trial_exhausted_at, created_at, last_purchase_product_name, last_purchase_at"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("credit_purchase_requests")
      .select("id, owner_id, product_name, credit_amount, price, status, requested_at, applied_at")
      .order("requested_at", { ascending: false }),
    supabase
      .from("limit_increase_history")
      .select("id, owner_id, previous_limit, new_limit, product_name, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  const emailByOwnerId: Record<string, string> = {};
  for (const u of usersRes.data?.users ?? []) {
    emailByOwnerId[u.id] = u.email ?? "(이메일 없음)";
  }

  const signups = (limits ?? []).map((l) => ({
    ...l,
    email: emailByOwnerId[l.owner_id] ?? "(알 수 없음)",
  }));
  const requestsWithEmail = (requests ?? []).map((r) => ({
    ...r,
    email: emailByOwnerId[r.owner_id] ?? "(알 수 없음)",
  }));
  const historyWithEmail = (history ?? []).map((h) => ({
    ...h,
    email: emailByOwnerId[h.owner_id] ?? "(알 수 없음)",
  }));

  return NextResponse.json({ signups, requests: requestsWithEmail, history: historyWithEmail });
}
