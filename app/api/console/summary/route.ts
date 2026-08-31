import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConsoleAuthed } from "@/lib/console-auth";

export async function GET() {
  if (!(await isConsoleAuthed())) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const supabase = createAdminClient();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { data: allLimits } = await supabase
    .from("account_limits")
    .select("owner_id, created_at, trial_exhausted_at, campaigns_created_count");

  const todaySignups = (allLimits ?? []).filter((r) => new Date(r.created_at) >= todayStart).length;
  const weekSignups = (allLimits ?? []).filter((r) => new Date(r.created_at) >= weekStart).length;
  const totalSignups = (allLimits ?? []).length;
  const exhaustedCount = (allLimits ?? []).filter((r) => r.trial_exhausted_at).length;
  const purgeSoonCount = (allLimits ?? []).filter(
    (r) => r.campaigns_created_count === 0 && new Date(r.created_at) < sevenDaysAgo
  ).length;

  const { data: requests } = await supabase
    .from("credit_purchase_requests")
    .select("status, price, requested_at");
  const pendingCount = (requests ?? []).filter((r) => r.status === "대기").length;
  const monthRevenue = (requests ?? [])
    .filter((r) => r.status === "완료" && new Date(r.requested_at) >= monthStart)
    .reduce((s, r) => s + r.price, 0);
  const totalRevenue = (requests ?? [])
    .filter((r) => r.status === "완료")
    .reduce((s, r) => s + r.price, 0);

  const { data: recentCampaigns } = await supabase
    .from("campaigns")
    .select("owner_id")
    .gte("created_at", sevenDaysAgo.toISOString());
  const activeUsers = new Set((recentCampaigns ?? []).map((c) => c.owner_id)).size;

  return NextResponse.json({
    todaySignups,
    weekSignups,
    totalSignups,
    exhaustedCount,
    pendingCount,
    monthRevenue,
    totalRevenue,
    activeUsers,
    purgeSoonCount,
  });
}
